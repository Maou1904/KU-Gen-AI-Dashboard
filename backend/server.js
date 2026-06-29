/**
 * KU Gen-AI Dashboard Backend API Server
 * Express.js API with optional database-backed data.
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const {
    connectDatabase,
    getDatabaseStatus,
    closeDatabases,
} = require('./config/database');
const migrate = require('./database/migrate');
const scheduler = require('./services/scheduler');

const dashboardRoutes = require('./routes/dashboard');
const apiManagementRoutes = require('./routes/apiManagement');
const departmentRoutes = require('./routes/department');
const behaviorRoutes = require('./routes/behavior');
const syncRoutes = require('./routes/sync');

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:8080',
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.locals.getDatabaseStatus = getDatabaseStatus;

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/api-management', apiManagementRoutes);
app.use('/api/department', departmentRoutes);
app.use('/api/behavior', behaviorRoutes);
app.use('/api/sync', syncRoutes);

app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: getDatabaseStatus(),
    });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
    const connection = await connectDatabase();
    if (connection.status.dashboard === 'connected') {
        if (String(process.env.RUN_MIGRATIONS || 'true').toLowerCase() === 'true') {
            await migrate();
        }
        await scheduler.start();
    }

    const server = app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Dashboard API: http://localhost:${PORT}/api`);
        console.log(`Health check: http://localhost:${PORT}/api/health`);
    });

    const shutdown = async () => {
        scheduler.stop();
        server.close();
        await closeDatabases();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    return server;
};

if (require.main === module) {
    startServer();
}

module.exports = app;
