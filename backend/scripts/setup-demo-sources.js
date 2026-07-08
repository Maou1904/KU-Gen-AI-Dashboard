require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');

const DEMO_NAME_PATTERN = /(^|[_-])demo($|[_-])/i;

const toNumber = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const quoteIdentifier = value => `"${String(value).replace(/"/g, '""')}"`;
const quoteLiteral = value => `'${String(value).replace(/'/g, "''")}'`;

const requireDemoName = (name, label) => {
    if (!DEMO_NAME_PATTERN.test(name)) {
        throw new Error(`${label}=${name} does not look like a demo database name`);
    }
};

const sharedAdminConfig = {
    host: process.env.PG_HOST || 'localhost',
    port: toNumber(process.env.PG_PORT, 5432),
    user: process.env.SEED_PG_USER || process.env.PG_USER || 'postgres',
    password: process.env.SEED_PG_PASSWORD || process.env.PG_PASSWORD,
};

const databaseNames = {
    kucsgenai: process.env.DEMO_KUCSGENAI_DB_NAME || 'kucsgenai_source_demo',
    dify: process.env.DEMO_DIFY_DB_NAME || 'dify_source_demo',
    dashboard: process.env.DEMO_DASHBOARD_DB_NAME || 'kucsgenai_dashboard_demo',
};

Object.entries(databaseNames).forEach(([label, name]) => requireDemoName(name, label));

const adminPool = new Pool({
    ...sharedAdminConfig,
    database: process.env.PG_ADMIN_DB || 'postgres',
});

const createDatabaseIfMissing = async databaseName => {
    const { rows } = await adminPool.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [databaseName]
    );
    if (rows.length) {
        console.log(`[demo:setup] database exists: ${databaseName}`);
        return;
    }
    await adminPool.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    console.log(`[demo:setup] database created: ${databaseName}`);
};

const applySchema = async (databaseName, schemaPath) => {
    const sql = await fs.readFile(schemaPath, 'utf8');
    const pool = new Pool({ ...sharedAdminConfig, database: databaseName });
    try {
        await pool.query(sql);
        console.log(`[demo:setup] schema applied: ${databaseName}`);
    } finally {
        await pool.end();
    }
};

const createReadOnlyRoleIfConfigured = async () => {
    const role = process.env.DEMO_SOURCE_READER_USER || process.env.SOURCE_PG_USER;
    const password = process.env.DEMO_SOURCE_READER_PASSWORD || process.env.SOURCE_PG_PASSWORD;
    if (!role) {
        console.log('[demo:setup] no source reader role configured; skipping grants');
        return;
    }
    if (role === sharedAdminConfig.user) {
        console.log('[demo:setup] source reader is the admin user; configure a separate SELECT-only role before sync');
        return;
    }

    const { rows } = await adminPool.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    if (!rows.length) {
        if (!password) {
            throw new Error(`Role ${role} does not exist and no DEMO_SOURCE_READER_PASSWORD/SOURCE_PG_PASSWORD was provided`);
        }
        await adminPool.query(
            `CREATE ROLE ${quoteIdentifier(role)} LOGIN PASSWORD ${quoteLiteral(password)}`
        );
        console.log(`[demo:setup] source reader role created: ${role}`);
    }

    for (const databaseName of [databaseNames.kucsgenai, databaseNames.dify]) {
        await adminPool.query(
            `GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseName)} TO ${quoteIdentifier(role)}`
        );
        const pool = new Pool({ ...sharedAdminConfig, database: databaseName });
        try {
            await pool.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
            await pool.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(role)}`);
            await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${quoteIdentifier(role)}`);
            await pool.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ${quoteIdentifier(role)}`);
            console.log(`[demo:setup] read-only grants applied for ${role} on ${databaseName}`);
        } finally {
            await pool.end();
        }
    }
};

const main = async () => {
    const databaseDir = path.join(__dirname, '..', 'database');
    await createDatabaseIfMissing(databaseNames.kucsgenai);
    await createDatabaseIfMissing(databaseNames.dify);
    await createDatabaseIfMissing(databaseNames.dashboard);
    await applySchema(
        databaseNames.kucsgenai,
        path.join(databaseDir, 'kucsgenai-source-demo-schema.sql')
    );
    await applySchema(
        databaseNames.dify,
        path.join(databaseDir, 'dify-source-demo-schema.sql')
    );
    await createReadOnlyRoleIfConfigured();

    console.log('\n[demo:setup] Use these values when running demo sync:');
    console.log(`DASHBOARD_DB_NAME=${databaseNames.dashboard}`);
    console.log(`KUCSGENAI_DB_NAME=${databaseNames.kucsgenai}`);
    console.log(`DIFY_DB_NAME=${databaseNames.dify}`);
};

main()
    .catch(error => {
        console.error(`[demo:setup] ${error.stack || error.message}`);
        process.exitCode = 1;
    })
    .finally(() => adminPool.end());
