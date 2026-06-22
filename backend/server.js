/**
 * KU Gen-AI Dashboard Backend API Server
 * Express.js API with optional database-backed data.
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const {
    sequelize,
    models,
    connectDatabase,
    getDatabaseStatus,
} = require('./config/database');

const dashboardRoutes = require('./routes/dashboard');
const apiManagementRoutes = require('./routes/apiManagement');
const departmentRoutes = require('./routes/department');
const behaviorRoutes = require('./routes/behavior');

const app = express();

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:8080',
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.locals.sequelize = sequelize;
app.locals.models = models;
app.locals.getDatabaseStatus = getDatabaseStatus;

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/api-management', apiManagementRoutes);
app.use('/api/department', departmentRoutes);
app.use('/api/behavior', behaviorRoutes);

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
    await connectDatabase();

    return app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Dashboard API: http://localhost:${PORT}/api`);
        console.log(`Health check: http://localhost:${PORT}/api/health`);
    });
};

if (require.main === module) {
    startServer();
}

module.exports = app;
