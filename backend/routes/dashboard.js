/**
 * Dashboard Routes
 * GET /api/dashboard/metrics - Get all dashboard KPIs
 * GET /api/dashboard/monthly-usage - Get monthly usage trends
 * GET /api/dashboard/trending-topics - Get trending topics
 */

const express = require('express');
const router = express.Router();

// Mock data fallback (when database is not connected)
const mockDashboardMetrics = [
    { metricName: 'ACTIVE_USERS', value: 1248, previousValue: 1110, changePercent: 12.5, unit: 'users' },
    { metricName: 'TOKEN_CONSUMPTION', value: 4200000, previousValue: 3885000, changePercent: 8.2, unit: 'tokens' },
    { metricName: 'ESTIMATED_COST', value: 8450, previousValue: 8450, changePercent: 0, unit: 'USD' },
    { metricName: 'TOTAL_CONVERSATIONS', value: 15300, previousValue: 13300, changePercent: 15.1, unit: 'conversations' }
];

const mockMonthlyUsage = [
    { month: 'Jan', year: 2024, usage: 2500 },
    { month: 'Feb', year: 2024, usage: 3200 },
    { month: 'Mar', year: 2024, usage: 4100 },
    { month: 'Apr', year: 2024, usage: 3800 },
    { month: 'May', year: 2024, usage: 4500 },
    { month: 'Jun', year: 2024, usage: 5200 }
];

const mockTrendingTopics = [
    { tag: '#MachineLearning', frequency: 245 },
    { tag: '#DataPipelines', frequency: 189 },
    { tag: '#EthicsInAI', frequency: 167 },
    { tag: '#NLP', frequency: 156 },
    { tag: '#QuantumComputing', frequency: 132 },
    { tag: '#ResearchGrants', frequency: 128 }
];

/**
 * GET /api/dashboard/metrics
 * Fetch all dashboard KPI metrics
 */
router.get('/metrics', async (req, res) => {
    try {
        // Try to fetch from database
        try {
            const { Dashboard } = req.app.locals.models || {};

            if (Dashboard) {
                const metrics = await Dashboard.findAll({
                    limit: 4,
                    order: [['createdAt', 'DESC']]
                });

                if (metrics.length > 0) {
                    return res.json({
                        success: true,
                        data: metrics,
                        source: 'database'
                    });
                }
            }
        } catch (dbError) {
            console.log('Database query failed, using mock data');
        }

        // Fallback to mock data
        res.json({
            success: true,
            data: mockDashboardMetrics,
            source: 'mock'
        });

    } catch (error) {
        console.error('Error fetching metrics:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/dashboard/monthly-usage
 * Fetch monthly usage trends
 */
router.get('/monthly-usage', async (req, res) => {
    try {
        // Try to fetch from database
        try {
            const { MonthlyUsage } = req.app.locals.models || {};
            
            if (MonthlyUsage) {
                const data = await MonthlyUsage.findAll({
                    order: [['year', 'ASC'], ['createdAt', 'ASC']],
                    limit: 6
                });

                if (data.length > 0) {
                    return res.json({
                        success: true,
                        data: data,
                        source: 'database'
                    });
                }
            }
        } catch (dbError) {
            console.log('Database query failed, using mock data');
        }

        // Fallback to mock data
        res.json({
            success: true,
            data: mockMonthlyUsage,
            source: 'mock'
        });

    } catch (error) {
        console.error('Error fetching monthly usage:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/dashboard/trending-topics
 * Fetch trending conversation topics
 */
router.get('/trending-topics', async (req, res) => {
    try {
        // Try to fetch from database
        try {
            const { TrendingTopic } = req.app.locals.models || {};
            
            if (TrendingTopic) {
                const data = await TrendingTopic.findAll({
                    where: { period: 'weekly' },
                    order: [['frequency', 'DESC']],
                    limit: 6
                });

                if (data.length > 0) {
                    return res.json({
                        success: true,
                        data: data,
                        source: 'database'
                    });
                }
            }
        } catch (dbError) {
            console.log('Database query failed, using mock data');
        }

        // Fallback to mock data
        res.json({
            success: true,
            data: mockTrendingTopics,
            source: 'mock'
        });

    } catch (error) {
        console.error('Error fetching trending topics:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
