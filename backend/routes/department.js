/**
 * Department Routes
 * GET /api/department/summary - Department statistics
 * GET /api/department/growth - Monthly growth by department
 * GET /api/department/heatmap - Peak usage heatmap data
 */

const express = require('express');
const router = express.Router();

// Mock data fallback
const mockDepartments = [
    { name: 'Computer Science', totalModelsUsed: 45210, computeShare: 45, costAllocation: 5412.50, status: 'Active' },
    { name: 'Biology', totalModelsUsed: 28540, computeShare: 28, costAllocation: 3990.00, status: 'Active' },
    { name: 'Physics', totalModelsUsed: 15100, computeShare: 15, costAllocation: 2137.50, status: 'Processing' },
    { name: 'Engineering', totalModelsUsed: 8800, computeShare: 8, costAllocation: 1140.00, status: 'Active' },
    { name: 'Agriculture', totalModelsUsed: 5350, computeShare: 4, costAllocation: 569.75, status: 'Active' }
];

const mockGrowthData = [
    { month: 'Jan', cs: 3, bio: 2 },
    { month: 'Feb', cs: 4, bio: 3 },
    { month: 'Mar', cs: 5, bio: 4 },
    { month: 'Apr', cs: 7, bio: 5 }
];

const mockKPIs = {
    totalQueries: 1200000,
    totalQueriesChange: 19.3,
    activeResearchers: 8432,
    activeResearchersChange: 4.2,
    estimatedCost: 14250.00,
    estimatedCostChange: -5,
    budgetProjected: 18000
};

/**
 * GET /api/department/summary
 * Fetch department summary data
 */
router.get('/summary', async (req, res) => {
    try {
        // Try to fetch from database
        try {
            const { Department } = req.app.locals.models || {};
            
            if (Department) {
                const data = await Department.findAll({
                    order: [['computeShare', 'DESC']]
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
            data: mockDepartments,
            source: 'mock'
        });

    } catch (error) {
        console.error('Error fetching department summary:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/department/kpis
 * Fetch department KPIs
 */
router.get('/kpis', async (req, res) => {
    try {
        res.json({
            success: true,
            data: mockKPIs,
            source: 'mock'
        });
    } catch (error) {
        console.error('Error fetching department KPIs:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/department/growth
 * Fetch monthly growth data by department
 */
router.get('/growth', async (req, res) => {
    try {
        // This would typically aggregate MonthlyUsage data by department
        // For now, returning mock data
        
        res.json({
            success: true,
            data: mockGrowthData,
            source: 'mock'
        });

    } catch (error) {
        console.error('Error fetching growth data:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/department/heatmap
 * Fetch peak usage heatmap data
 */
router.get('/heatmap', async (req, res) => {
    try {
        // Generate heatmap data - 28 cells (4 time slots x 7 days)
        const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
        const hours = ['9a', '12p', '3p', '8p'];
        const colors = ['#e0e8e0', '#a3f69c', '#2e7d32', '#0d631b'];

        const heatmapData = [];
        for (let h = 0; h < hours.length; h++) {
            for (let d = 0; d < days.length; d++) {
                const intensity = Math.floor(Math.random() * 4);
                heatmapData.push({
                    day: days[d],
                    hour: hours[h],
                    value: Math.floor(Math.random() * 100),
                    intensity: intensity,
                    color: colors[intensity]
                });
            }
        }

        res.json({
            success: true,
            data: heatmapData,
            source: 'generated'
        });

    } catch (error) {
        console.error('Error fetching heatmap data:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
