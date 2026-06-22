// Mock Data Module - Fallback when backend is unavailable
const MockData = {
    // Dashboard Overview Data
    getMonthlyUsageData() {
        return [
            { month: 'Jan', usage: 2500, color: '#d0d9d0' },
            { month: 'Feb', usage: 3200, color: '#d0d9d0' },
            { month: 'Mar', usage: 4100, color: '#d0d9d0' },
            { month: 'Apr', usage: 3800, color: '#d0d9d0' },
            { month: 'May', usage: 4500, color: '#d0d9d0' },
            { month: 'Jun', usage: 5200, color: '#0d631b' }
        ];
    },

    getTrendingTopics() {
        return [
            { tag: '#MachineLearning', color: 'bg-primary' },
            { tag: '#DataPipelines', color: 'bg-primary' },
            { tag: '#EthicsInAI', color: 'bg-primary' },
            { tag: '#NLP', color: 'bg-primary' },
            { tag: '#QuantumComputing', color: 'bg-primary' },
            { tag: '#ResearchGrants', color: 'bg-primary' }
        ];
    },

    // API Management Data
    getModelTokenConsumption() {
        return [
            { modelName: 'GPT-4o', tokens: '45.2M', percentage: 45.2, color: '#0d631b' },
            { modelName: 'Claude 3.5 Sonnet', tokens: '28.9M', percentage: 28.9, color: '#0054a7' },
            { modelName: 'Llama 2 70b', tokens: '12.5M', percentage: 12.5, color: '#d0d9d0' },
            { modelName: 'Other Models', tokens: '13.4M', percentage: 13.4, color: '#e0e8e0' }
        ];
    },

    getHierarchyData() {
        return [
            { campus: 'Bangkhen', faculty: 'Faculty of Engineering', department: 'Computer Engineering', tokens: 24600000 },
            { campus: 'Bangkhen', faculty: 'Faculty of Science', department: 'Data Science Institute', tokens: 18200000 },
            { campus: 'Kamphaeng Saen', faculty: 'Faculty of Agriculture', department: 'Smart Farming Lab', tokens: 9850000 },
            { campus: 'Siriracha', faculty: 'Faculty of Management Sciences', department: 'FinTech Research', tokens: 6400000 },
            { campus: 'Bangkhen', faculty: 'Library Services', department: 'Digital Archives', tokens: 3300000 }
        ];
    },

    // User Behavior Data
    getDailyActiveUsers() {
        return [
            { day: 'Mon', users: 1500 },
            { day: 'Tue', users: 2100 },
            { day: 'Wed', users: 1900 },
            { day: 'Thu', users: 2800 },
            { day: 'Fri', users: 3200 },
            { day: 'Sat', users: 4100 },
            { day: 'Sun', users: 5842 }
        ];
    },

    getTopAppDistribution() {
        return [
            { app: 'Research Assistant AI', percentage: 60, color: '#0d631b' },
            { app: 'Grant Writer Pro', percentage: 30, color: '#a3f69c' },
            { app: 'Syllabus Generator', percentage: 10, color: '#d0d9d0' }
        ];
    },

    getPopularTags() {
        return [
            '#MachineLearning', '#DataPipelines', '#EthicsInAI', '#NLP', '#QuantumComputing',
            '#ResearchGrants', '#LLM', '#Bioinformatics', '#CyberSecurity', '#FacultySupportProgram'
        ];
    },

    // Department Data
    getDepartmentData() {
        return [
            { 
                name: 'Computer Science', 
                totalModelsUsed: 45210, 
                computeShare: 45, 
                costAllocation: 5412.50,
                status: 'Active',
                statusColor: 'bg-primary'
            },
            { 
                name: 'Biology', 
                totalModelsUsed: 28540, 
                computeShare: 28, 
                costAllocation: 3990.00,
                status: 'Active',
                statusColor: 'bg-tertiary'
            },
            { 
                name: 'Physics', 
                totalModelsUsed: 15100, 
                computeShare: 15, 
                costAllocation: 2137.50,
                status: 'Processing',
                statusColor: 'bg-yellow-500'
            },
            { 
                name: 'Engineering', 
                totalModelsUsed: 8800, 
                computeShare: 8, 
                costAllocation: 1140.00,
                status: 'Active',
                statusColor: 'bg-primary'
            },
            { 
                name: 'Agriculture', 
                totalModelsUsed: 5350, 
                computeShare: 4, 
                costAllocation: 569.75,
                status: 'Active',
                statusColor: 'bg-primary'
            }
        ];
    },

    getMonthlyGrowthData() {
        return [
            { month: 'Jan', cs: 3, bio: 2 },
            { month: 'Feb', cs: 4, bio: 3 },
            { month: 'Mar', cs: 5, bio: 4 },
            { month: 'Apr', cs: 7, bio: 5 }
        ];
    },

    getKPIData() {
        return {
            dashboard: [
                { label: 'ACTIVE USERS', value: '1,248', change: '+12.5%', icon: 'group', type: 'positive' },
                { label: 'TOKEN CONSUMPTION', value: '4.2M', change: '+8.2%', icon: 'token', type: 'positive' },
                { label: 'ESTIMATED COST', value: '$8,450', change: 'Steady', icon: 'payments', type: 'neutral' },
                { label: 'TOTAL CONVERSATIONS', value: '15.3k', change: '+15.1%', icon: 'forum', type: 'positive' }
            ],
            department: [
                { label: 'TOTAL QUERIES', value: '1.2M', change: '+19.3%', icon: 'search', type: 'positive' },
                { label: 'ACTIVE RESEARCHERS', value: '8,432', change: '+4.2%', icon: 'person', type: 'positive' },
                { label: 'EST. COST (COMPUTE)', value: '$14,250.00', change: 'Approaching Budget', icon: 'warning', type: 'warning' }
            ],
            behavior: [
                { label: 'TOTAL NOTES GENERATED', value: '142,853', change: '+12.4%', icon: 'note', type: 'positive' }
            ]
        };
    }
};
