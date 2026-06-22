const { Sequelize } = require('sequelize');
const { initializeModels } = require('../models');

const toNumber = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const toBoolean = (value, fallback = false) => {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value).toLowerCase() === 'true';
};

const sequelize = new Sequelize(
    process.env.DB_NAME || 'kucsgenai_dashboard',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST || 'localhost',
        port: toNumber(process.env.DB_PORT, 3306),
        dialect: process.env.DB_DIALECT || 'mysql',
        logging: toBoolean(process.env.DB_LOG, process.env.NODE_ENV === 'development')
            ? console.log
            : false,
        pool: {
            min: toNumber(process.env.DB_POOL_MIN, 0),
            max: toNumber(process.env.DB_POOL_MAX, 10),
            acquire: toNumber(process.env.DB_POOL_ACQUIRE, 30000),
            idle: toNumber(process.env.DB_POOL_IDLE, 10000),
        },
    }
);

const models = initializeModels(sequelize);
let isConnected = false;

const connectDatabase = async () => {
    try {
        await sequelize.authenticate();
        isConnected = true;
        console.log('[database] Connection established');

        if (toBoolean(process.env.DB_SYNC, true)) {
            await sequelize.sync({
                alter: toBoolean(process.env.DB_SYNC_ALTER, false),
            });
            console.log('[database] Models synchronized');
        }

        return { sequelize, models, isConnected };
    } catch (error) {
        isConnected = false;
        console.warn(`[database] Unavailable, using mock data fallback: ${error.message}`);
        return { sequelize, models, isConnected, error };
    }
};

const getDatabaseStatus = () => (isConnected ? 'connected' : 'disconnected');

module.exports = {
    sequelize,
    models,
    connectDatabase,
    getDatabaseStatus,
};
