/**
 * KU Gen-AI Dashboard Backend API Server
 * Express.js server with database connection
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { Sequelize } = require('sequelize');

// Import routes
const dashboardRoutes = require('./routes/dashboard');
const apiManagementRoutes = require('./routes/apiManagement');
const departmentRoutes = require('./routes/department');
const behaviorRoutes = require('./routes/behavior');

// Initialize Express app
const app = express();

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:8080',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database Connection
const sequelize = new Sequelize(
    process.env.DB_NAME || 'kucsgenai_dashboard',
    process.env.DB_USER || 'root',
    process.env.DB_PASSWORD || '',
    {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        dialect: 'mysql',
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
    }
);

// Test database connection
sequelize.authenticate()
    .then(() => {
        console.log('✓ Database connection established successfully');
    })
    .catch(err => {
        console.warn('⚠ Database connection failed. Using mock data fallback:', err.message);
    });

// Sync database models
sequelize.sync({ alter: process.env.NODE_ENV === 'development' })
    .then(() => {
        console.log('✓ Database models synchronized');
    })
    .catch(err => {
        console.warn('⚠ Database sync warning:', err.message);
    });

// Export sequelize for use in models and routes
app.locals.sequelize = sequelize;

// API Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/api-management', apiManagementRoutes);
app.use('/api/department', departmentRoutes);
app.use('/api/behavior', behaviorRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: sequelize.connectionManager.pool ? 'connected' : 'disconnected'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Dashboard API: http://localhost:${PORT}/api`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
