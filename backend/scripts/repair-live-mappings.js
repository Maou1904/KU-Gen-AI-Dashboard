require('dotenv').config();

const { dashboardPool, closeDatabases } = require('../config/database');
const syncService = require('../services/sync-service');

const repair = async () => {
    const client = await dashboardPool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `UPDATE fact_usage_event
             SET org_unit_key = NULL,
                 quality_flags = CASE
                    WHEN quality_flags ? 'org_unmapped' THEN quality_flags
                    ELSE quality_flags || '["org_unmapped"]'::jsonb
                 END
             WHERE org_unit_key IN (
                SELECT org_unit_key FROM dim_org_unit WHERE org_level = 'unit'
             )`
        );
        await client.query(
            `UPDATE fact_note
             SET org_unit_key = NULL
             WHERE org_unit_key IN (
                SELECT org_unit_key FROM dim_org_unit WHERE org_level = 'unit'
             )`
        );
        await client.query(
            `DELETE FROM user_org_history
             WHERE org_unit_key IN (
                SELECT org_unit_key FROM dim_org_unit WHERE org_level = 'unit'
             )`
        );
        for (const table of [
            'fact_user_activity_daily',
            'agg_usage_daily',
            'agg_usage_hourly',
            'agg_topic_daily',
        ]) {
            await client.query(
                `DELETE FROM ${table}
                 WHERE org_unit_key IN (
                    SELECT org_unit_key FROM dim_org_unit WHERE org_level = 'unit'
                 )`
            );
        }
        await client.query(`DELETE FROM dim_org_unit WHERE org_level = 'unit'`);
        await client.query(
            `DELETE FROM etl_watermark
             WHERE source_name = 'dify'
               AND source_table IN ('messages', 'workflow_node_executions')`
        );
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    return syncService.run('mapping-repair');
};

repair()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
        console.error(`[repair] ${error.stack || error.message}`);
        process.exitCode = 1;
    })
    .finally(closeDatabases);
