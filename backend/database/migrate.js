const fs = require('fs/promises');
const path = require('path');
require('dotenv').config();

const { dashboardPool } = require('../config/database');

const migrate = async () => {
    const schemaPath = path.join(__dirname, 'dashboard-schema.sql');
    const sql = await fs.readFile(schemaPath, 'utf8');
    await dashboardPool.query(sql);
    console.log(`[migration] Applied ${path.basename(schemaPath)}`);

    const migrationsPath = path.join(__dirname, 'migrations');
    const migrationFiles = (await fs.readdir(migrationsPath))
        .filter(file => file.endsWith('.sql'))
        .sort();
    for (const migrationFile of migrationFiles) {
        const migrationPath = path.join(migrationsPath, migrationFile);
        await dashboardPool.query(await fs.readFile(migrationPath, 'utf8'));
        console.log(`[migration] Applied ${migrationFile}`);
    }
};

if (require.main === module) {
    migrate()
        .then(() => dashboardPool.end())
        .catch(error => {
            console.error(`[migration] ${error.message}`);
            process.exitCode = 1;
        });
}

module.exports = migrate;
