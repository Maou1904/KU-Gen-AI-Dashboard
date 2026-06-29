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
        ['/api/dashboard/metrics'],
        ['/api/dashboard/monthly-usage'],
        ['/api/dashboard/trending-topics'],
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
    const schedule = status.data.schedule;
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
