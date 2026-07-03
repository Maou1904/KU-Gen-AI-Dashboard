const { Pool } = require('pg');

const toNumber = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const shared = {
    host: process.env.PG_HOST || 'localhost',
    port: toNumber(process.env.PG_PORT, 5432),
    max: toNumber(process.env.DB_POOL_MAX, 10),
    idleTimeoutMillis: toNumber(process.env.DB_POOL_IDLE, 10000),
    connectionTimeoutMillis: toNumber(process.env.DB_POOL_ACQUIRE, 5000),
};

const dashboardPool = new Pool({
    ...shared,
    user: process.env.DASHBOARD_PG_USER || process.env.PG_USER || 'postgres',
    password: process.env.DASHBOARD_PG_PASSWORD || process.env.PG_PASSWORD,
    database: process.env.DASHBOARD_DB_NAME || 'kucsgenai_dashboard_test',
    application_name: 'kucsgenai-dashboard-writer',
});

const sourceConfig = {
    ...shared,
    user: process.env.SOURCE_PG_USER || process.env.PG_USER || 'postgres',
    password: process.env.SOURCE_PG_PASSWORD || process.env.PG_PASSWORD,
    options: '-c default_transaction_read_only=on',
};

const kucsgenaiPool = new Pool({
    ...sourceConfig,
    database: process.env.KUCSGENAI_DB_NAME || 'kucsgenai',
    application_name: 'kucsgenai-dashboard-source-reader',
});
const difyPool = new Pool({
    ...sourceConfig,
    database: process.env.DIFY_DB_NAME || 'dify',
    application_name: 'kucsgenai-dashboard-dify-reader',
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

const SOURCE_TABLES = {
    kucsgenai: ['apps', 'app_category', 'sub_category', 'user', 'user_app_usage', 'ai_notes'],
    dify: ['apps', 'app_model_configs', 'messages', 'workflow_node_executions'],
};

const inspectPool = async (name, pool) => {
    const requiredTables = SOURCE_TABLES[name] || [];
    const { rows } = await pool.query(
        `SELECT
            current_database() AS database,
            current_user AS "user",
            current_setting('transaction_read_only') = 'on' AS "readOnly"`
    );
    const details = {
        name,
        status: 'connected',
        ...rows[0],
    };

    if (requiredTables.length) {
        const privileges = await pool.query(
            `SELECT
                COUNT(*) FILTER (
                    WHERE has_table_privilege(
                        current_user,
                        'public.' || quote_ident(table_name),
                        'SELECT'
                    )
                )::int AS "selectableTables",
                COUNT(*) FILTER (
                    WHERE has_table_privilege(
                        current_user,
                        'public.' || quote_ident(table_name),
                        'INSERT, UPDATE, DELETE, TRUNCATE'
                    )
                )::int AS "writableTables"
             FROM unnest($1::text[]) AS required(table_name)`,
            [requiredTables]
        );
        details.requiredTables = requiredTables.length;
        details.selectableTables = privileges.rows[0].selectableTables;
        details.writableTables = privileges.rows[0].writableTables;
        details.safeReadOnly = details.readOnly
            && details.selectableTables === requiredTables.length
            && details.writableTables === 0;
    } else {
        const privilege = await pool.query(
            `SELECT
                has_table_privilege(current_user, 'public.sync_schedule', 'UPDATE') AS "canUpdateSchedule",
                has_table_privilege(current_user, 'public.fact_usage_event', 'INSERT') AS "canInsertFacts"`
        );
        details.canWrite = privilege.rows[0].canUpdateSchedule
            && privilege.rows[0].canInsertFacts;
    }
    return details;
};

const inspectDatabaseConnections = async () => {
    const pools = [
        ['dashboard', dashboardPool],
        ['kucsgenai', kucsgenaiPool],
        ['dify', difyPool],
    ];
    return Promise.all(pools.map(async ([name, pool]) => {
        try {
            return await inspectPool(name, pool);
        } catch (error) {
            return { name, status: 'disconnected', error: error.message };
        }
    }));
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
    inspectDatabaseConnections,
    closeDatabases,
};
