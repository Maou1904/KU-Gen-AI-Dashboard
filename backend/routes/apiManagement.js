/**
 * API Management Routes
 * GET /api/api-management/model-consumption - Token consumption by model
 * GET /api/api-management/hierarchy - Usage by campus/faculty/department
 * GET /api/api-management/costs - Cost breakdown
 */

const express = require('express');
const router = express.Router();

// Mock data fallback
const mockModelConsumption = [
    { modelName: 'GPT-4o', tokens: '45.2M', percentage: 45.2, cost: 5485 },
    { modelName: 'Claude 3.5 Sonnet', tokens: '28.9M', percentage: 28.9, cost: 3550 },
    { modelName: 'Llama 2 70b', tokens: '12.5M', percentage: 12.5, cost: 890 },
    { modelName: 'Other Models', tokens: '13.4M', percentage: 13.4, cost: 825 }
];

const mockHierarchy = [
    { campus: 'Bangkhen', faculty: 'Faculty of Engineering', department: 'Computer Engineering', tokensUsed: 24600000, costAllocation: 3010 },
    { campus: 'Bangkhen', faculty: 'Faculty of Science', department: 'Data Science Institute', tokensUsed: 18200000, costAllocation: 2227 },
    { campus: 'Kamphaeng Saen', faculty: 'Faculty of Agriculture', department: 'Smart Farming Lab', tokensUsed: 9850000, costAllocation: 1204 },
    { campus: 'Siriracha', faculty: 'Faculty of Management Sciences', department: 'FinTech Research', tokensUsed: 6400000, costAllocation: 783 },
    { campus: 'Bangkhen', faculty: 'Library Services', department: 'Digital Archives', tokensUsed: 3300000, costAllocation: 403 }
];

const mockCosts = {
    currentBillingCycle: 4285.50,
    projectedEndOfMonth: 5100,
    costEfficiency: -120,
    cachingSavings: 8,
    estimatedMonthlyBudget: 18000
};

/**
 * GET /api/api-management/model-consumption
 * Fetch token consumption by AI model
 */
router.get('/model-consumption', async (req, res) => {
    try {
        // Try to fetch from database
        try {
            const sequelize = req.app.locals.sequelize;
            const ModelConsumption = sequelize.model('ModelConsumption');
            
            if (ModelConsumption) {
                const data = await ModelConsumption.findAll({
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
            data: mockModelConsumption,
            source: 'mock'
        });

    } catch (error) {
        console.error('Error fetching model consumption:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/api-management/hierarchy
 * Fetch usage by hierarchy (campus/faculty/department)
 */
router.get('/hierarchy', async (req, res) => {
    try {
        // Try to fetch from database
        try {
            const sequelize = req.app.locals.sequelize;
            const Hierarchy = sequelize.model('Hierarchy');
            
            if (Hierarchy) {
                const data = await Hierarchy.findAll({
                    order: [['tokensUsed', 'DESC']],
                    limit: 10
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
            data: mockHierarchy,
            source: 'mock'
        });

    } catch (error) {
        console.error('Error fetching hierarchy data:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/api-management/costs
 * Fetch cost breakdown and billing information
 */
router.get('/costs', async (req, res) => {
    try {
        // Calculate from database if available
        try {
            const sequelize = req.app.locals.sequelize;
            const ModelConsumption = sequelize.model('ModelConsumption');
            
            if (ModelConsumption) {
                const consumption = await ModelConsumption.findAll();
                
                if (consumption.length > 0) {
                    const totalCost = consumption.reduce((sum, item) => sum + (item.cost || 0), 0);
                    const currentCycle = totalCost * 0.84; // Assume 84% of month has passed

                    return res.json({
                        success: true,
                        data: {
                            currentBillingCycle: parseFloat(currentCycle.toFixed(2)),
                            projectedEndOfMonth: parseFloat((totalCost * 1.2).toFixed(2)),
                            costEfficiency: parseFloat((-120).toFixed(2)),
                            cachingSavings: 8,
                            estimatedMonthlyBudget: 18000
                        },
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
            data: mockCosts,
            source: 'mock'
        });

    } catch (error) {
        console.error('Error fetching costs:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
