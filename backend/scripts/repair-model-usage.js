require('dotenv').config();

const {
    dashboardPool,
    closeDatabases,
} = require('../config/database');
const syncService = require('../services/sync-service');

const repair = async () => {
    const schedule = await syncService.getSchedule();
    const runResult = await dashboardPool.query(
        `INSERT INTO etl_run (source_name, status)
         VALUES ('dify:model-repair', 'running')
         RETURNING run_id`
    );
    const runId = runResult.rows[0].run_id;

    try {
        await dashboardPool.query(
            `DELETE FROM etl_watermark
             WHERE source_name = 'dify'
               AND source_table IN ('messages', 'workflow_node_executions')`
        );
        const apps = await syncService.syncApps();
        const modelEvents = await syncService.syncModelUsage(schedule, runId);
        await syncService.runQualityChecks(runId);
        await dashboardPool.query(
            `UPDATE etl_run
             SET status = 'success',
                 finished_at = NOW(),
                 rows_read = $2,
                 rows_updated = $2
             WHERE run_id = $1`,
            [runId, apps + modelEvents]
        );
        return { runId, apps, modelEvents };
    } catch (error) {
        await dashboardPool.query(
            `UPDATE etl_run
             SET status = 'failed',
                 finished_at = NOW(),
                 error_message = $2
             WHERE run_id = $1`,
            [runId, error.message]
        );
        throw error;
    }
};

repair()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
        console.error(`[model-repair] ${error.stack || error.message}`);
        process.exitCode = 1;
    })
    .finally(closeDatabases);
