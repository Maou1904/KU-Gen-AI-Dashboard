/**
 * User Behavior Routes
 * GET /api/behavior/daily-users - Daily active users
 * GET /api/behavior/trending-tags - Popular conversation tags
 * GET /api/behavior/app-distribution - App usage distribution
 */

const express = require('express');
const router = express.Router();

// Mock data fallback
const mockDailyUsers = [
    { day: 'Mon', users: 1500 },
    { day: 'Tue', users: 2100 },
    { day: 'Wed', users: 1900 },
    { day: 'Thu', users: 2800 },
    { day: 'Fri', users: 3200 },
    { day: 'Sat', users: 4100 },
    { day: 'Sun', users: 5842 }
];

const mockTrendingTags = [
    '#MachineLearning', '#DataPipelines', '#EthicsInAI', '#NLP', '#QuantumComputing',
    '#ResearchGrants', '#LLM', '#Bioinformatics', '#CyberSecurity', '#FacultySupportProgram'
];

const mockAppDistribution = [
    { app: 'Research Assistant AI', percentage: 60, usageCount: 8520 },
    { app: 'Grant Writer Pro', percentage: 30, usageCount: 4260 },
    { app: 'Syllabus Generator', percentage: 10, usageCount: 1420 }
];

const mockBehaviorKPI = {
    totalNotesGenerated: 142853,
    totalNotesGeneratedChange: 12.4,
    avgNotesPerUser: 114.48
};

/**
 * GET /api/behavior/daily-users
 * Fetch daily active users trend
 */
router.get('/daily-users', async (req, res) => {
    try {
        // Try to fetch from database
        try {
            const sequelize = req.app.locals.sequelize;
            const UserActivity = sequelize.model('UserActivity');
            
            if (UserActivity) {
                const data = await UserActivity.findAll({
                    order: [['date', 'ASC']],
                    limit: 7,
                    attributes: [
                        ['date', 'day'],
                        ['activeUsers', 'users']
                    ]
                });

                if (data.length > 0) {
                    const formatted = data.map(d => ({
                        day: new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' }),
                        users: d.dataValues.users
                    }));
                    
                    return res.json({
                        success: true,
                        data: formatted,
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
            data: mockDailyUsers,
            source: 'mock'
        });

    } catch (error) {
        console.error('Error fetching daily users:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/behavior/trending-tags
 * Fetch trending conversation tags
 */
router.get('/trending-tags', async (req, res) => {
    try {
        // Try to fetch from database
        try {
            const sequelize = req.app.locals.sequelize;
            const TrendingTopic = sequelize.model('TrendingTopic');
            
            if (TrendingTopic) {
                const data = await TrendingTopic.findAll({
                    where: { period: 'weekly' },
                    order: [['frequency', 'DESC']],
                    limit: 15,
                    attributes: ['tag']
                });

                if (data.length > 0) {
                    const tags = data.map(d => d.tag);
                    return res.json({
                        success: true,
                        data: tags,
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
            data: mockTrendingTags,
            source: 'mock'
        });

    } catch (error) {
        console.error('Error fetching trending tags:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/behavior/app-distribution
 * Fetch application usage distribution
 */
router.get('/app-distribution', async (req, res) => {
    try {
        // Try to fetch from database
        try {
            const sequelize = req.app.locals.sequelize;
            const AppDistribution = sequelize.model('AppDistribution');
            
            if (AppDistribution) {
                const data = await AppDistribution.findAll({
                    order: [['percentage', 'DESC']]
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
            data: mockAppDistribution,
            source: 'mock'
        });

    } catch (error) {
        console.error('Error fetching app distribution:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/behavior/kpi
 * Fetch behavior KPIs
 */
router.get('/kpi', async (req, res) => {
    try {
        res.json({
            success: true,
            data: mockBehaviorKPI,
            source: 'mock'
        });

    } catch (error) {
        console.error('Error fetching behavior KPI:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
