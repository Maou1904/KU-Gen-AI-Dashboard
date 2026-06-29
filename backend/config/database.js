const { Pool } = require('pg');

const toNumber = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const shared = {
    host: process.env.PG_HOST || 'localhost',
    port: toNumber(process.env.PG_PORT, 5432),
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD,
    max: toNumber(process.env.DB_POOL_MAX, 10),
    idleTimeoutMillis: toNumber(process.env.DB_POOL_IDLE, 10000),
    connectionTimeoutMillis: toNumber(process.env.DB_POOL_ACQUIRE, 5000),
};

const dashboardPool = new Pool({
    ...shared,
    database: process.env.DASHBOARD_DB_NAME || 'kucsgenai_dashboard_test',
});

const kucsgenaiPool = new Pool({
    ...shared,
    database: process.env.KUCSGENAI_DB_NAME || 'kucsgenai',
});

const difyPool = new Pool({
    ...shared,
    database: process.env.DIFY_DB_NAME || 'dify',
});

const status = {
    dashboard: 'disconnected',
    kucsgenai: 'disconnected',
    dify: 'disconnected',
};

const checkPool = async (name, pool) => {
    try {
        await pool.query('SELECT 1');
        status[name] = 'connected';
    } catch (error) {
        status[name] = 'disconnected';
        throw new Error(`${name}: ${error.message}`);
    }
};

const connectDatabase = async () => {
    const results = await Promise.allSettled([
        checkPool('dashboard', dashboardPool),
        checkPool('kucsgenai', kucsgenaiPool),
        checkPool('dify', difyPool),
    ]);

    const failures = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason.message);

    if (failures.length) {
        console.warn(`[database] ${failures.join('; ')}`);
    } else {
        console.log('[database] Dashboard and source connections established');
    }

    return { status: { ...status }, failures };
};

const getDatabaseStatus = () => ({ ...status });

const closeDatabases = async () => {
    await Promise.allSettled([
        dashboardPool.end(),
        kucsgenaiPool.end(),
        difyPool.end(),
    ]);
};

module.exports = {
    dashboardPool,
    kucsgenaiPool,
    difyPool,
    connectDatabase,
    getDatabaseStatus,
    closeDatabases,
};
