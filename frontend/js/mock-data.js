// Mock Data Module - Fallback and interactive UI data.
const MockData = {
    campuses: ['All', 'Bangkhen', 'Kamphaeng Saen', 'Siriracha'],
    facultiesByCampus: {
        All: ['All'],
        Bangkhen: ['All', 'Faculty of Engineering', 'Faculty of Science', 'Faculty of Business Administration', 'Library Services'],
        'Kamphaeng Saen': ['All', 'Faculty of Agriculture', 'Faculty of Education and Development Sciences'],
        Siriracha: ['All', 'Faculty of Management Sciences', 'Faculty of Engineering at Sriracha'],
    },
    departmentsByFaculty: {
        All: ['All'],
        'Faculty of Engineering': ['All', 'Computer Engineering', 'Industrial Engineering', 'Electrical Engineering'],
        'Faculty of Science': ['All', 'Data Science Institute', 'Computer Science', 'Statistics'],
        'Faculty of Business Administration': ['All', 'Business Analytics', 'Marketing'],
        'Library Services': ['All', 'Digital Archives', 'Learning Innovation'],
        'Faculty of Agriculture': ['All', 'Smart Farming Lab', 'Crop Science'],
        'Faculty of Education and Development Sciences': ['All', 'EdTech Research', 'Curriculum Innovation'],
        'Faculty of Management Sciences': ['All', 'FinTech Research', 'Logistics Analytics'],
        'Faculty of Engineering at Sriracha': ['All', 'Automation Engineering', 'AI Manufacturing Lab'],
    },

    getDashboardData(scope = 'Overview', period = 'Month') {
        const scopeFactor = { Overview: 1, Faculty: 1.08, Department: 0.92 }[scope] || 1;
        const periodFactor = { '7 Days': 0.32, Month: 1, Year: 8.8, Custom: 1.45 }[period] || 1;
        const users = Math.round(1248 * scopeFactor * Math.min(periodFactor, 2.4));
        const tokens = 4.2 * scopeFactor * periodFactor;
        const cost = Math.round(8450 * scopeFactor * periodFactor);
        const transactions = 15.3 * scopeFactor * periodFactor;

        return {
            kpis: [
                { label: 'ACTIVE USERS', value: users.toLocaleString(), change: '+12.5% from last month', icon: 'group', type: 'positive' },
                { label: 'TOKEN CONSUMPTION', value: `${tokens.toFixed(1)}M`, change: '+8.2% from last month', icon: 'token', type: 'positive' },
                { label: 'ESTIMATED COST', value: `$${cost.toLocaleString()}`, change: 'Steady from last month', icon: 'payments', type: 'neutral' },
                { label: 'TOTAL TRANSACTIONS', value: `${transactions.toFixed(1)}k`, change: '+15.1% from last month', icon: 'forum', type: 'positive' },
            ],
            monthly: this.getMonthlyUsageData(period, scopeFactor),
            topics: this.getTrendingTopics(scope),
        };
    },

    getMonthlyUsageData(period = 'Month', factor = 1) {
        const periodFactor = { '7 Days': 0.24, Month: 1, Year: 9, Custom: 1.35 }[period] || 1;
        const base = [2500, 3200, 4100, 3800, 4500, 5200];
        return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((month, index) => ({
            month,
            usage: Math.round(base[index] * periodFactor * factor),
            color: index === 5 ? '#0d631b' : '#d0d9d0',
        }));
    },

    getTrendingTopics(scope = 'Overview') {
        const topicSets = {
            Overview: ['#Research', '#DataScience', '#NLP', '#GrantWriting', '#MachineLearning', '#LiteratureReview'],
            Faculty: ['#MachineLearning', '#DataPipelines', '#EthicsInAI', '#Bioinformatics', '#ResearchGrants', '#DatasetCuration'],
            Department: ['#NLP', '#QuantumComputing', '#CyberSecurity', '#LLM', '#FacultySupport', '#Automation'],
        };
        return (topicSets[scope] || topicSets.Overview).map(tag => ({ tag }));
    },

    getModelTokenConsumption() {
        return [
            { modelName: 'GPT-4o', tokens: '45.2M', percentage: 45.2, color: '#0d631b' },
            { modelName: 'Claude 3.5 Sonnet', tokens: '28.9M', percentage: 28.9, color: '#2f74c7' },
            { modelName: 'Llama 3 70B', tokens: '12.5M', percentage: 12.5, color: '#c4d1c4' },
            { modelName: 'Other Models', tokens: '13.4M', percentage: 13.4, color: '#dce6dc' },
        ];
    },

    getHierarchyData(filters = {}) {
        const rows = [
            { campus: 'Bangkhen', faculty: 'Faculty of Engineering', department: 'Computer Engineering', tokensUsed: 24500000 },
            { campus: 'Bangkhen', faculty: 'Faculty of Engineering', department: 'Industrial Engineering', tokensUsed: 11200000 },
            { campus: 'Bangkhen', faculty: 'Faculty of Engineering', department: 'Electrical Engineering', tokensUsed: 9400000 },
            { campus: 'Bangkhen', faculty: 'Faculty of Science', department: 'Data Science Institute', tokensUsed: 18200000 },
            { campus: 'Bangkhen', faculty: 'Faculty of Science', department: 'Computer Science', tokensUsed: 15400000 },
            { campus: 'Bangkhen', faculty: 'Faculty of Science', department: 'Statistics', tokensUsed: 7100000 },
            { campus: 'Bangkhen', faculty: 'Faculty of Business Administration', department: 'Business Analytics', tokensUsed: 5800000 },
            { campus: 'Bangkhen', faculty: 'Library Services', department: 'Digital Archives', tokensUsed: 3100000 },
            { campus: 'Kamphaeng Saen', faculty: 'Faculty of Agriculture', department: 'Smart Farming Lab', tokensUsed: 9850000 },
            { campus: 'Kamphaeng Saen', faculty: 'Faculty of Agriculture', department: 'Crop Science', tokensUsed: 6900000 },
            { campus: 'Kamphaeng Saen', faculty: 'Faculty of Education and Development Sciences', department: 'EdTech Research', tokensUsed: 4200000 },
            { campus: 'Siriracha', faculty: 'Faculty of Management Sciences', department: 'FinTech Research', tokensUsed: 6400000 },
            { campus: 'Siriracha', faculty: 'Faculty of Management Sciences', department: 'Logistics Analytics', tokensUsed: 5100000 },
            { campus: 'Siriracha', faculty: 'Faculty of Engineering at Sriracha', department: 'AI Manufacturing Lab', tokensUsed: 7300000 },
        ];

        return rows.filter(row => {
            const campusOk = !filters.campus || filters.campus === 'All' || row.campus === filters.campus;
            const facultyOk = !filters.faculty || filters.faculty === 'All' || row.faculty === filters.faculty;
            const departmentOk = !filters.department || filters.department === 'All' || row.department === filters.department;
            return campusOk && facultyOk && departmentOk;
        });
    },

    getMonthlyTokensByYears(compareYears = 1) {
        const allYears = [
            { year: '2026', values: [3100, 4300, 6900, 6700, 7600, 8200, 9100, 9800, 10400, 11200, 12100, 12800], color: '#0d631b' },
            { year: '2025', values: [2300, 3600, 4200, 4100, 5200, 5700, 6100, 6600, 7200, 7600, 8200, 8800], color: '#0054a7' },
            { year: '2024', values: [1800, 2500, 3100, 3600, 3900, 4300, 4600, 5000, 5300, 5600, 5900, 6300], color: '#7bb77e' },
            { year: '2023', values: [1200, 1700, 2200, 2500, 2800, 3200, 3400, 3700, 3900, 4200, 4400, 4700], color: '#94a89a' },
            { year: '2022', values: [900, 1200, 1500, 1700, 2100, 2300, 2500, 2800, 3000, 3200, 3400, 3600], color: '#c4d1c4' },
        ];

        return {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            series: allYears.slice(0, Number(compareYears) || 1),
        };
    },

    getAnalyticsDepartments(scope = 'Overview', period = 'Month') {
        const periodFactor = { '7 Days': 0.28, Month: 1, Year: 11.4 }[period] || 1;
        const all = [
            ['Computer Science', 'Faculty of Science', 45210, 6412.50],
            ['Computer Engineering', 'Faculty of Engineering', 43880, 6120.75],
            ['Data Science Institute', 'Faculty of Science', 38940, 5488.10],
            ['Smart Farming Lab', 'Faculty of Agriculture', 31820, 4210.40],
            ['FinTech Research', 'Faculty of Management Sciences', 28470, 3990.00],
            ['Business Analytics', 'Faculty of Business Administration', 25110, 3524.80],
            ['AI Manufacturing Lab', 'Faculty of Engineering at Sriracha', 22900, 3194.50],
            ['Digital Archives', 'Library Services', 20350, 2862.70],
            ['Statistics', 'Faculty of Science', 18120, 2536.80],
            ['EdTech Research', 'Faculty of Education and Development Sciences', 16240, 2270.00],
            ['Crop Science', 'Faculty of Agriculture', 14890, 2086.30],
            ['Logistics Analytics', 'Faculty of Management Sciences', 13220, 1850.80],
            ['Electrical Engineering', 'Faculty of Engineering', 12840, 1797.60],
            ['Marketing', 'Faculty of Business Administration', 10950, 1533.00],
            ['Learning Innovation', 'Library Services', 9680, 1355.20],
            ['Curriculum Innovation', 'Faculty of Education and Development Sciences', 8420, 1178.80],
            ['Industrial Engineering', 'Faculty of Engineering', 7890, 1104.60],
            ['Automation Engineering', 'Faculty of Engineering at Sriracha', 7240, 1013.60],
        ];

        const filtered = scope === 'Overview' ? all : all.filter(row => scope === 'Faculty' ? row[1].includes('Science') || row[1].includes('Engineering') : true);
        return filtered.map(([name, faculty, tokens, cost]) => ({
            name,
            faculty,
            totalModelsUsed: Math.round(tokens * periodFactor),
            costAllocation: Number((cost * periodFactor).toFixed(2)),
        }));
    },

    getBehaviorData(period = '7 Days') {
        const factor = { '7 Days': 1, Month: 3.4, Year: 14 }[period] || 1;
        const baseUsers = [1100, 1400, 2400, 2000, 3700, 3300, 4300, 3950, 5150, 5842];
        return {
            totalNotes: Math.round(142853 * factor),
            change: period === '7 Days' ? '+12.4%' : period === 'Month' ? '+18.1%' : '+31.7%',
            activeUsers: baseUsers.map((users, index) => ({
                day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'][index],
                users: Math.round(users * Math.min(factor, 2.2)),
            })),
            tags: this.getPopularTags(period),
        };
    },

    getDailyActiveUsers() {
        return this.getBehaviorData('7 Days').activeUsers;
    },

    getTopAppDistribution() {
        return [
            { app: 'Research Assistant AI', percentage: 60, color: '#0d631b' },
            { app: 'Grant Writer Pro', percentage: 30, color: '#7bd77a' },
            { app: 'Syllabus Generator', percentage: 10, color: '#c4d1c4' },
        ];
    },

    getPopularTags(period = '7 Days') {
        const tags = {
            '7 Days': ['#MachineLearning', '#DataPipelines', '#EthicsInAI', '#ResearchGrants', '#NLP', '#QuantumComputing', '#Bioinformatics', '#LLM', '#CyberSecurity', '#FacultySupport'],
            Month: ['#DataPipelines', '#MachineLearning', '#GrantWriting', '#DatasetCuration', '#LiteratureReview', '#NLP', '#Bioinformatics', '#EthicsInAI', '#ResearchMethods', '#AIPolicy'],
            Year: ['#MachineLearning', '#ResearchGrants', '#CyberSecurity', '#DataScience', '#LLM', '#AgricultureAI', '#EducationTech', '#Bioinformatics', '#FinTech', '#Automation'],
        };
        return tags[period] || tags['7 Days'];
    },

    getKPIData() {
        return {
            dashboard: this.getDashboardData().kpis,
            department: [
                { label: 'TOTAL TRANSACTIONS', value: '1.2M', change: '+15.3%', icon: 'query_stats', type: 'positive' },
                { label: 'ACTIVE USERS', value: '8,432', change: '+4.2%', icon: 'group', type: 'positive' },
            ],
            behavior: [
                { label: 'TOTAL NOTES GENERATED', value: '142,853', change: '+12.4%', icon: 'note', type: 'positive' },
            ],
        };
    },
};
