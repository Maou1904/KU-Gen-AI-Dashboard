/**
 * Database Models for KU Gen-AI Dashboard
 * Using Sequelize ORM with MySQL
 */

const { DataTypes } = require('sequelize');

/**
 * Dashboard Model - Stores dashboard metrics and statistics
 */
const createDashboardModel = (sequelize) => {
    return sequelize.define('Dashboard', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        metricName: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'e.g., ACTIVE_USERS, TOKEN_CONSUMPTION, ESTIMATED_COST'
        },
        value: {
            type: DataTypes.DECIMAL(15, 2),
            allowNull: false,
            comment: 'Metric value'
        },
        previousValue: {
            type: DataTypes.DECIMAL(15, 2),
            comment: 'Previous period value for comparison'
        },
        unit: {
            type: DataTypes.STRING,
            comment: 'e.g., users, tokens, USD'
        },
        changePercent: {
            type: DataTypes.DECIMAL(5, 2),
            comment: 'Percentage change from previous period'
        },
        timestamp: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            onUpdate: DataTypes.NOW,
        }
    }, {
        tableName: 'dashboard_metrics',
        timestamps: true
    });
};

/**
 * Monthly Usage Model - Historical monthly usage trends
 */
const createMonthlyUsageModel = (sequelize) => {
    return sequelize.define('MonthlyUsage', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        month: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'e.g., Jan, Feb, Mar'
        },
        year: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        usage: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        }
    }, {
        tableName: 'monthly_usage',
        timestamps: true
    });
};

/**
 * API Model Consumption - Token usage by AI model
 */
const createModelConsumptionModel = (sequelize) => {
    return sequelize.define('ModelConsumption', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        modelName: {
            type: DataTypes.STRING,
            allowNull: false,
            comment: 'e.g., GPT-4o, Claude 3.5, Llama 2'
        },
        tokens: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        percentage: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
        },
        cost: {
            type: DataTypes.DECIMAL(12, 2),
            comment: 'Estimated cost for this model'
        },
        timestamp: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        }
    }, {
        tableName: 'model_consumption',
        timestamps: true
    });
};

/**
 * Hierarchy Model - Campus/Faculty/Department structure
 */
const createHierarchyModel = (sequelize) => {
    return sequelize.define('Hierarchy', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        campus: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        faculty: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        department: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        tokensUsed: {
            type: DataTypes.BIGINT,
            allowNull: false,
        },
        costAllocation: {
            type: DataTypes.DECIMAL(12, 2),
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        }
    }, {
        tableName: 'hierarchy',
        timestamps: true
    });
};

/**
 * Department Model - Department-level statistics
 */
const createDepartmentModel = (sequelize) => {
    return sequelize.define('Department', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        totalModelsUsed: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        computeShare: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
            comment: 'Percentage of total compute'
        },
        costAllocation: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
        },
        status: {
            type: DataTypes.ENUM('Active', 'Processing', 'Inactive'),
            defaultValue: 'Active',
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        }
    }, {
        tableName: 'departments',
        timestamps: true
    });
};

/**
 * User Activity Model - Daily active users tracking
 */
const createUserActivityModel = (sequelize) => {
    return sequelize.define('UserActivity', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        date: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        activeUsers: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        totalSessions: {
            type: DataTypes.INTEGER,
        },
        avgSessionDuration: {
            type: DataTypes.INTEGER,
            comment: 'In seconds'
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        }
    }, {
        tableName: 'user_activity',
        timestamps: true
    });
};

/**
 * Trending Topics Model - Popular conversation tags
 */
const createTrendingTopicModel = (sequelize) => {
    return sequelize.define('TrendingTopic', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        tag: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        frequency: {
            type: DataTypes.INTEGER,
            defaultValue: 1,
        },
        period: {
            type: DataTypes.STRING,
            comment: 'e.g., daily, weekly, monthly'
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        }
    }, {
        tableName: 'trending_topics',
        timestamps: true
    });
};

/**
 * App Distribution Model - Usage of different applications
 */
const createAppDistributionModel = (sequelize) => {
    return sequelize.define('AppDistribution', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        appName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        usageCount: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        percentage: {
            type: DataTypes.DECIMAL(5, 2),
            allowNull: false,
        },
        activeUsers: {
            type: DataTypes.INTEGER,
        },
        createdAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
        }
    }, {
        tableName: 'app_distribution',
        timestamps: true
    });
};

/**
 * Initialize all models
 */
const initializeModels = (sequelize) => {
    const models = {
        Dashboard: createDashboardModel(sequelize),
        MonthlyUsage: createMonthlyUsageModel(sequelize),
        ModelConsumption: createModelConsumptionModel(sequelize),
        Hierarchy: createHierarchyModel(sequelize),
        Department: createDepartmentModel(sequelize),
        UserActivity: createUserActivityModel(sequelize),
        TrendingTopic: createTrendingTopicModel(sequelize),
        AppDistribution: createAppDistributionModel(sequelize),
    };

    return models;
};

module.exports = {
    createDashboardModel,
    createMonthlyUsageModel,
    createModelConsumptionModel,
    createHierarchyModel,
    createDepartmentModel,
    createUserActivityModel,
    createTrendingTopicModel,
    createAppDistributionModel,
    initializeModels,
};
