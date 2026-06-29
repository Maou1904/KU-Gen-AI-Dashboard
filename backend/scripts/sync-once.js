require('dotenv').config();

const migrate = require('../database/migrate');
const syncService = require('../services/sync-service');
const { closeDatabases } = require('../config/database');

const run = async () => {
    if (String(process.env.RUN_MIGRATIONS || 'false').toLowerCase() === 'true') {
        await migrate();
    }
    const result = await syncService.run('cli');
    console.log(JSON.stringify(result, null, 2));
};

run()
    .catch(error => {
        console.error(`[sync] ${error.stack || error.message}`);
        process.exitCode = 1;
    })
    .finally(closeDatabases);
