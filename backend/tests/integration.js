require('dotenv').config();

const app = require('../server');
const {
    connectDatabase,
    closeDatabases,
} = require('../config/database');

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
        ['/api/dashboard/metrics'],
        ['/api/dashboard/monthly-usage'],
        ['/api/dashboard/trending-topics'],
        ['/api/api-management/provider-consumption'],
        ['/api/api-management/model-consumption'],
        ['/api/api-management/hierarchy'],
        ['/api/api-management/costs'],
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

    const providers = await request(baseUrl, '/api/api-management/provider-consumption');
    const providerNames = providers.data.map(item => item.family);
    if (!providerNames.includes('GPT') || !providerNames.includes('Gemini')) {
        throw new Error('Provider consumption must include GPT and Gemini families');
    }
    const gptModels = await request(baseUrl, '/api/api-management/model-consumption?family=GPT');
    if (!gptModels.data.length || gptModels.data.some(item => !item.modelName)) {
        throw new Error('GPT provider drilldown must return model names');
    }

    const appDistribution = await request(baseUrl, '/api/behavior/app-distribution');
    const percentageTotal = appDistribution.data.reduce(
        (sum, item) => sum + Number(item.percentage),
        0
    );
    if (Math.abs(percentageTotal - 100) > 0.1 || appDistribution.data.length > 6) {
        throw new Error('Top Active Apps must be Top 5 plus Other and total 100%');
    }

    const hierarchy = await request(baseUrl, '/api/api-management/hierarchy');
    if (hierarchy.data.some(item =>
        item.campus === 'Unknown'
        || item.faculty === 'Unknown'
        || item.department === 'Unknown'
    )) {
        throw new Error('Hierarchy API must not synthesize Unknown organization levels');
    }

    const filtered = await request(
        baseUrl,
        '/api/dashboard/metrics?start=2025-06-01&end=2025-06-30&campuses=B'
    );
    const filteredTransactions = filtered.data.find(
        item => item.metricName === 'TOTAL_TRANSACTIONS'
    );
    if (Number(filteredTransactions?.value) !== 1) {
        throw new Error('Hierarchy and date filter contract did not affect dashboard metrics');
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
