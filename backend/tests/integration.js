require('dotenv').config();

const app = require('../server');
const {
    connectDatabase,
    closeDatabases,
    dashboardPool,
    difyPool,
} = require('../config/database');
const {
    usageSource,
    modelUsageSource,
    noteSource,
} = require('../routes/filter-utils');

let server;

const request = async (baseUrl, path, options = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
    });
    const body = await response.json();
    if (!response.ok) {
        throw new Error(`${path}: ${response.status} ${body.error || 'request failed'}`);
    }
    return body;
};

const run = async () => {
    const connection = await connectDatabase();
    if (Object.values(connection.status).some(value => value !== 'connected')) {
        throw new Error(`Database connection failed: ${JSON.stringify(connection.status)}`);
    }

    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const checks = [
        ['/api/health'],
        ['/api/sync/status'],
        ['/api/sync/preflight'],
        ['/api/dashboard/available-years'],
        ['/api/dashboard/metrics'],
        ['/api/dashboard/monthly-usage'],
        ['/api/dashboard/trending-topics'],
        ['/api/api-management/provider-consumption'],
        ['/api/api-management/model-consumption'],
        ['/api/api-management/hierarchy'],
        ['/api/api-management/costs'],
        ['/api/api-management/model-latency'],
        ['/api/department/summary?limit=7&offset=0'],
        ['/api/department/kpis'],
        ['/api/department/heatmap'],
        ['/api/behavior/daily-users'],
        ['/api/behavior/trending-tags'],
        ['/api/behavior/app-distribution'],
        ['/api/behavior/kpi'],
    ];

    const results = {};
    for (const [path] of checks) {
        const body = await request(baseUrl, path);
        if (path === '/api/dashboard/metrics') {
            const coinMetric = body.data.find(metric => metric.metricName === 'COIN_CONSUMPTION');
            if (!coinMetric || coinMetric.unit !== 'Coin') {
                throw new Error('Dashboard metrics must expose COIN_CONSUMPTION in Coin');
            }
        }
        if (path === '/api/api-management/costs' && body.data.unit !== 'Coin') {
            throw new Error('Consumption summary must expose Coin as its unit');
        }
        if (path === '/api/api-management/costs' && !('currentTokenConsumption' in body.data)) {
            throw new Error('Consumption summary must expose token consumption for KPI cards');
        }
        if (path === '/api/api-management/model-latency' && body.data.some(item => item.avgLatency == null)) {
            throw new Error('Model latency must expose average latency values');
        }
        if (path === '/api/department/kpis' && body.data.unit !== 'Coin') {
            throw new Error('Department KPIs must expose Coin as their unit');
        }
        results[path] = Array.isArray(body.data)
            ? body.data.length
            : body.data ? 'ok' : body.status || 'ok';
    }

    const status = await request(baseUrl, '/api/sync/status');
    results.syncCounts = status.data.counts;
    const sources = status.data.connections.filter(connection => connection.name !== 'dashboard');
    if (sources.some(connection => !connection.safeReadOnly)) {
        throw new Error('Source database connections must be protected as read only');
    }
    const schedule = status.data.schedule;

    const availableYears = await request(baseUrl, '/api/dashboard/available-years');
    const expectedYearsResult = await dashboardPool.query(
        `WITH years AS (
            SELECT EXTRACT(YEAR FROM event_at)::int AS year
            FROM ${usageSource} u
            WHERE event_at IS NOT NULL
            UNION
            SELECT EXTRACT(YEAR FROM event_at)::int AS year
            FROM ${modelUsageSource} u
            WHERE event_at IS NOT NULL
            UNION
            SELECT EXTRACT(YEAR FROM created_at)::int AS year
            FROM ${noteSource} n
            WHERE created_at IS NOT NULL
         )
         SELECT year
         FROM years
         WHERE year IS NOT NULL
         ORDER BY year`
    );
    const expectedYears = expectedYearsResult.rows.map(row => Number(row.year));
    const responseYears = availableYears.data.map(Number);
    if (JSON.stringify(responseYears) !== JSON.stringify(expectedYears)) {
        throw new Error('Available years must come from live dashboard data only');
    }

    const providers = await request(baseUrl, '/api/api-management/provider-consumption');
    const providerNames = providers.data.map(item => item.family);
    if (!providerNames.includes('GPT') || !providerNames.includes('Gemini')) {
        throw new Error('Provider consumption must include GPT and Gemini families');
    }
    const gptModels = await request(baseUrl, '/api/api-management/model-consumption?family=GPT');
    if (!gptModels.data.length || gptModels.data.some(item => !item.modelName)) {
        throw new Error('GPT provider drilldown must return model names');
    }
    const sourceModelUsage = await difyPool.query(
        `SELECT
            (
                SELECT COALESCE(SUM(
                    (execution_metadata::jsonb ->> 'total_tokens')::bigint
                ), 0)
                FROM workflow_node_executions
                WHERE node_type = 'llm' AND status = 'succeeded'
            ) + (
                SELECT COALESCE(SUM(message_tokens + answer_tokens), 0)
                FROM messages
                WHERE workflow_run_id IS NULL
                  AND model_provider IS NOT NULL
                  AND model_id IS NOT NULL
            ) AS tokens,
            (
                SELECT COUNT(*)
                FROM workflow_node_executions
                WHERE node_type = 'llm' AND status = 'succeeded'
            ) + (
                SELECT COUNT(*)
                FROM messages
                WHERE workflow_run_id IS NULL
                  AND model_provider IS NOT NULL
                  AND model_id IS NOT NULL
            ) AS events`
    );
    const providerTokens = providers.data.reduce(
        (sum, item) => sum + Number(item.tokens),
        0
    );
    const providerEvents = providers.data.reduce(
        (sum, item) => sum + Number(item.events),
        0
    );
    if (
        providerTokens !== Number(sourceModelUsage.rows[0].tokens)
        || providerEvents !== Number(sourceModelUsage.rows[0].events)
    ) {
        throw new Error('Model consumption must reconcile to successful LLM nodes without double counting');
    }
    const dashboardMetrics = await request(baseUrl, '/api/dashboard/metrics');
    const dashboardTokens = dashboardMetrics.data.find(
        metric => metric.metricName === 'TOKEN_CONSUMPTION'
    );
    const departmentKPIs = await request(baseUrl, '/api/department/kpis');
    const monthlyUsage = await request(baseUrl, '/api/dashboard/monthly-usage');
    if (monthlyUsage.data.some(item => item.activeUsers == null || item.coins == null)) {
        throw new Error('Monthly usage must expose active users and Coin totals for overview trends');
    }
    const monthlyTokens = monthlyUsage.data.reduce(
        (sum, item) => sum + Number(item.tokens),
        0
    );
    const expectedTokens = Number(sourceModelUsage.rows[0].tokens);
    if (
        Number(dashboardTokens?.value) !== expectedTokens
        || Number(departmentKPIs.data.totalTokens) !== expectedTokens
        || monthlyTokens !== expectedTokens
    ) {
        throw new Error('All-time token KPIs and trends must use the shared model usage total');
    }

    const appDistribution = await request(baseUrl, '/api/behavior/app-distribution');
    const percentageTotal = appDistribution.data.reduce(
        (sum, item) => sum + Number(item.percentage),
        0
    );
    if (Math.abs(percentageTotal - 100) > 0.1 || appDistribution.data.length > 6) {
        throw new Error('Top Active Apps must be Top 5 plus Other and total 100%');
    }

    const modelLatency = await request(baseUrl, '/api/api-management/model-latency?groupBy=model');
    if (modelLatency.mode !== 'models' || modelLatency.data.some(item => item.avgLatency == null)) {
        throw new Error('Model latency must support direct model grouping for Consumption V2');
    }

    const hierarchy = await request(baseUrl, '/api/api-management/hierarchy');
    if (hierarchy.data.some(item =>
        item.campus === 'Unknown'
        || item.faculty === 'Unknown'
        || item.department === 'Unknown'
    )) {
        throw new Error('Hierarchy API must not synthesize Unknown organization levels');
    }

    const filterFixture = await dashboardPool.query(
        `SELECT
            TO_CHAR(DATE_TRUNC('month', event_at), 'YYYY-MM-DD') AS start,
            TO_CHAR(DATE_TRUNC('month', event_at) + INTERVAL '1 month - 1 day', 'YYYY-MM-DD') AS end,
            campus,
            COUNT(*)::int AS transactions
         FROM ${usageSource} u
         WHERE campus IS NOT NULL
         GROUP BY DATE_TRUNC('month', event_at), campus
         ORDER BY DATE_TRUNC('month', event_at) DESC, transactions DESC
         LIMIT 1`
    );
    const fixture = filterFixture.rows[0];
    if (!fixture) {
        throw new Error('No hierarchy/date data is available to validate dashboard filters');
    }
    const filtered = await request(
        baseUrl,
        `/api/dashboard/metrics?start=${fixture.start}&end=${fixture.end}&campuses=${encodeURIComponent(fixture.campus)}`
    );
    const filteredTransactions = filtered.data.find(
        item => item.metricName === 'TOTAL_TRANSACTIONS'
    );
    if (Number(filteredTransactions?.value) !== Number(fixture.transactions)) {
        throw new Error('Hierarchy and date filter contract did not affect dashboard metrics');
    }

    const comparisonRange = await dashboardPool.query(
        `SELECT
            TO_CHAR(DATE_TRUNC('month', event_at), 'YYYY-MM-DD') AS start,
            TO_CHAR(DATE_TRUNC('month', event_at) + INTERVAL '1 month - 1 day', 'YYYY-MM-DD') AS end
         FROM fact_usage_event
         GROUP BY DATE_TRUNC('month', event_at)
         ORDER BY DATE_TRUNC('month', event_at) DESC
         LIMIT 1`
    );
    const range = comparisonRange.rows[0];
    const comparisonQuery = `?start=${range.start}&end=${range.end}`;

    const dashboardMonthlyTrend = await request(
        baseUrl,
        `/api/dashboard/monthly-usage${comparisonQuery}&granularity=month`
    );
    const dashboardDailyTrend = await request(
        baseUrl,
        `/api/dashboard/monthly-usage${comparisonQuery}&granularity=day`
    );
    const dashboardYearlyTrend = await request(
        baseUrl,
        '/api/dashboard/monthly-usage?granularity=year'
    );
    if (
        dashboardMonthlyTrend.granularity !== 'month'
        || dashboardDailyTrend.granularity !== 'day'
        || dashboardYearlyTrend.granularity !== 'year'
        || dashboardMonthlyTrend.data.length !== 1
        || dashboardDailyTrend.data.length < dashboardMonthlyTrend.data.length
        || dashboardYearlyTrend.data.length < 1
    ) {
        throw new Error('Dashboard transaction trends must support day, month, and year granularity');
    }

    const behaviorMonthlyUsers = await request(
        baseUrl,
        `/api/behavior/daily-users${comparisonQuery}&granularity=month`
    );
    const behaviorDailyUsers = await request(
        baseUrl,
        `/api/behavior/daily-users${comparisonQuery}&granularity=day`
    );
    const behaviorYearlyUsers = await request(
        baseUrl,
        '/api/behavior/daily-users?granularity=year'
    );
    if (
        behaviorMonthlyUsers.granularity !== 'month'
        || behaviorDailyUsers.granularity !== 'day'
        || behaviorYearlyUsers.granularity !== 'year'
        || behaviorMonthlyUsers.data.length !== 1
        || behaviorDailyUsers.data.length < behaviorMonthlyUsers.data.length
        || behaviorYearlyUsers.data.length < 1
    ) {
        throw new Error('Behavior active-user trends must support day, month, and year granularity');
    }

    const comparisonMetrics = await request(
        baseUrl,
        `/api/dashboard/metrics${comparisonQuery}`
    );
    for (const metric of comparisonMetrics.data) {
        const previous = Number(metric.previousValue || 0);
        const expected = previous
            ? Number((((Number(metric.value) - previous) / previous) * 100).toFixed(2))
            : null;
        if (metric.changePercent !== expected) {
            throw new Error(`${metric.metricName} comparison is not calculated from live periods`);
        }
    }

    const comparisonKPIs = await request(
        baseUrl,
        `/api/department/kpis${comparisonQuery}`
    );
    const expectedTokenChange = Number(comparisonKPIs.data.previousTokens || 0)
        ? Number(((
            (Number(comparisonKPIs.data.totalTokens) - Number(comparisonKPIs.data.previousTokens))
            / Number(comparisonKPIs.data.previousTokens)
        ) * 100).toFixed(2))
        : null;
    if (comparisonKPIs.data.changes.totalTokens !== expectedTokenChange) {
        throw new Error('Analytics token comparison is not calculated from live periods');
    }

    const comparisonCosts = await request(
        baseUrl,
        `/api/api-management/costs${comparisonQuery}`
    );
    const actualCoinChange = Number(comparisonCosts.data.usageChange);
    const expectedCoinChange = Number(comparisonCosts.data.currentBillingCycle)
        - Number(comparisonCosts.data.previousBillingCycle);
    if (Math.abs(actualCoinChange - expectedCoinChange) > 0.000001) {
        throw new Error('Consumption Coin change is not calculated from live periods');
    }
    const actualTokenChange = Number(comparisonCosts.data.tokenUsageChange);
    const expectedConsumptionTokenChange = Number(comparisonCosts.data.currentTokenConsumption)
        - Number(comparisonCosts.data.previousTokenConsumption);
    if (Math.abs(actualTokenChange - expectedConsumptionTokenChange) > 0.000001) {
        throw new Error('Consumption token change is not calculated from live periods');
    }

    const comparisonNotes = await request(
        baseUrl,
        `/api/behavior/kpi${comparisonQuery}`
    );
    const previousNotes = Number(comparisonNotes.data.previousNotesGenerated || 0);
    const expectedNoteChange = previousNotes
        ? Number(((
            (Number(comparisonNotes.data.totalNotesGenerated) - previousNotes)
            / previousNotes
        ) * 100).toFixed(2))
        : null;
    if (comparisonNotes.data.changePercent !== expectedNoteChange) {
        throw new Error('Behavior note comparison is not calculated from live periods');
    }

    const allTimeMetrics = await request(baseUrl, '/api/dashboard/metrics');
    if (allTimeMetrics.data.some(metric => metric.changePercent !== null)) {
        throw new Error('All-time metrics must not invent a previous-period comparison');
    }

    await request(baseUrl, '/api/sync/schedule', {
        method: 'PUT',
        body: JSON.stringify({
            isEnabled: false,
            intervalMinutes: Number(schedule.interval_minutes),
            overlapMinutes: Number(schedule.overlap_minutes),
            batchSize: Number(schedule.batch_size),
        }),
    });

    console.log(JSON.stringify(results, null, 2));
    await new Promise(resolve => server.close(resolve));
};

run()
    .catch(error => {
        console.error(error.stack || error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (server?.listening) {
            await new Promise(resolve => server.close(resolve));
        }
        await closeDatabases();
    });
