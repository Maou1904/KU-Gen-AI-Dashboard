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

    getDateFactor(date = {}) {
        if (typeof date === 'string') {
            return { '7 Days': 0.32, Month: 1, Year: 11.4, Custom: 1.45 }[date] || 1;
        }
        if (date.mode === 'year') return 11.4;
        if (date.mode === 'custom' && date.range?.length === 2) {
            const days = Math.max(1, (new Date(date.range[1]) - new Date(date.range[0])) / 86400000 + 1);
            return Math.max(0.1, days / 30);
        }
        return 1;
    },

    matchesHierarchy(row, hierarchy = {}) {
        const campuses = hierarchy.campuses || [];
        const faculties = hierarchy.faculties || [];
        const departments = hierarchy.departments || [];
        return (!campuses.length || campuses.includes(row.campus))
            && (!faculties.length || faculties.includes(row.faculty))
            && (!departments.length || departments.includes(row.department));
    },

    getHierarchyShare(hierarchy = {}) {
        const allRows = this.getHierarchyData();
        const selectedRows = allRows.filter(row => this.matchesHierarchy(row, hierarchy));
        const allTokens = allRows.reduce((sum, row) => sum + row.tokensUsed, 0);
        const selectedTokens = selectedRows.reduce((sum, row) => sum + row.tokensUsed, 0);
        return allTokens ? selectedTokens / allTokens : 1;
    },

    getDashboardData(filter = {}, legacyPeriod = null) {
        const hierarchy = typeof filter === 'string' ? {} : filter.hierarchy || {};
        const date = typeof filter === 'string' ? legacyPeriod || 'Month' : filter.date || {};
        const scopeFactor = Math.max(0.08, this.getHierarchyShare(hierarchy));
        const periodFactor = this.getDateFactor(date);
        const users = Math.round(1248 * scopeFactor * Math.min(periodFactor, 2.4));
        const tokens = 4.2 * scopeFactor * periodFactor;
        const cost = Math.round(8450 * scopeFactor * periodFactor);
        const transactions = 15.3 * scopeFactor * periodFactor;

        return {
            kpis: [
                { label: 'ACTIVE USERS', value: users.toLocaleString(), change: '+12.5% from last month', icon: 'group', type: 'positive' },
                { label: 'TOKEN CONSUMPTION', value: `${tokens.toFixed(1)}M`, change: '+8.2% from last month', icon: 'token', type: 'positive' },
                { label: 'COIN CONSUMPTION', value: `${cost.toLocaleString()} Coin`, change: 'Steady from last month', icon: 'toll', type: 'neutral' },
                { label: 'TOTAL TRANSACTIONS', value: `${transactions.toFixed(1)}k`, change: '+15.1% from last month', icon: 'forum', type: 'positive' },
            ],
            monthly: this.getMonthlyUsageData(date, scopeFactor),
            topics: this.getTrendingTopics(hierarchy.departments?.length ? 'Department' : hierarchy.faculties?.length ? 'Faculty' : 'Overview'),
        };
    },

    getMonthlyUsageData(date = {}, factor = 1) {
        const periodFactor = this.getDateFactor(date);
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

    getAppTokenConsumption() {
        return [
            { id: 'research', appName: 'Research Assistant AI', tokens: 34.2, percentage: 34.2, color: '#0d631b' },
            { id: 'grant', appName: 'Grant Writer Pro', tokens: 24.8, percentage: 24.8, color: '#0054a7' },
            { id: 'syllabus', appName: 'Syllabus Generator', tokens: 18.4, percentage: 18.4, color: '#78a47d' },
            { id: 'insight', appName: 'Data Insight Lab', tokens: 13.6, percentage: 13.6, color: '#94a89a' },
            { id: 'other', appName: 'Other Apps', tokens: 9, percentage: 9, color: '#dce6dc' },
        ];
    },

    getModelsForApp(appId) {
        const models = {
            research: [
                ['GPT-4o', 18.4, '#0d631b'],
                ['Claude 3.5 Sonnet', 10.2, '#0054a7'],
                ['Llama 3 70B', 5.6, '#94a89a'],
            ],
            grant: [
                ['Claude 3.5 Sonnet', 13.1, '#0054a7'],
                ['GPT-4o', 8.7, '#0d631b'],
                ['Gemini 1.5 Pro', 3, '#78a47d'],
            ],
            syllabus: [
                ['GPT-4o mini', 10.3, '#0d631b'],
                ['Llama 3 70B', 5.1, '#94a89a'],
                ['Claude 3 Haiku', 3, '#0054a7'],
            ],
            insight: [
                ['GPT-4o', 7.2, '#0d631b'],
                ['Gemini 1.5 Pro', 4.6, '#78a47d'],
                ['Llama 3 70B', 1.8, '#94a89a'],
            ],
            other: [
                ['GPT-4o mini', 3.8, '#0d631b'],
                ['Claude 3 Haiku', 2.9, '#0054a7'],
                ['Other Models', 2.3, '#dce6dc'],
            ],
        };
        const rows = models[appId] || [];
        const total = rows.reduce((sum, row) => sum + row[1], 0);
        return rows.map(([modelName, tokenValue, color]) => ({
            modelName,
            tokenValue,
            tokens: `${tokenValue.toFixed(1)}M`,
            percentage: Number((tokenValue * 100 / total).toFixed(1)),
            color,
        }));
    },

    getModelTokenConsumption() {
        return this.getModelsForApp('research');
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
            { campus: 'Bangkhen', faculty: 'Faculty of Business Administration', department: 'Marketing', tokensUsed: 4200000 },
            { campus: 'Bangkhen', faculty: 'Library Services', department: 'Digital Archives', tokensUsed: 3100000 },
            { campus: 'Bangkhen', faculty: 'Library Services', department: 'Learning Innovation', tokensUsed: 2700000 },
            { campus: 'Kamphaeng Saen', faculty: 'Faculty of Agriculture', department: 'Smart Farming Lab', tokensUsed: 9850000 },
            { campus: 'Kamphaeng Saen', faculty: 'Faculty of Agriculture', department: 'Crop Science', tokensUsed: 6900000 },
            { campus: 'Kamphaeng Saen', faculty: 'Faculty of Education and Development Sciences', department: 'EdTech Research', tokensUsed: 4200000 },
            { campus: 'Kamphaeng Saen', faculty: 'Faculty of Education and Development Sciences', department: 'Curriculum Innovation', tokensUsed: 3600000 },
            { campus: 'Siriracha', faculty: 'Faculty of Management Sciences', department: 'FinTech Research', tokensUsed: 6400000 },
            { campus: 'Siriracha', faculty: 'Faculty of Management Sciences', department: 'Logistics Analytics', tokensUsed: 5100000 },
            { campus: 'Siriracha', faculty: 'Faculty of Engineering at Sriracha', department: 'AI Manufacturing Lab', tokensUsed: 7300000 },
            { campus: 'Siriracha', faculty: 'Faculty of Engineering at Sriracha', department: 'Automation Engineering', tokensUsed: 4800000 },
        ];

        return rows.filter(row => {
            if (filters.campus || filters.faculty || filters.department) {
                return (!filters.campus || filters.campus === 'All' || row.campus === filters.campus)
                    && (!filters.faculty || filters.faculty === 'All' || row.faculty === filters.faculty)
                    && (!filters.department || filters.department === 'All' || row.department === filters.department);
            }
            return this.matchesHierarchy(row, filters);
        });
    },

    getMonthlyTokensByYears(selectedYears = ['2026']) {
        const allYears = [
            { year: '2026', values: [3100, 4300, 6900, 6700, 7600, 8200, 9100, 9800, 10400, 11200, 12100, 12800], color: '#0d631b' },
            { year: '2025', values: [2300, 3600, 4200, 4100, 5200, 5700, 6100, 6600, 7200, 7600, 8200, 8800], color: '#0054a7' },
            { year: '2024', values: [1800, 2500, 3100, 3600, 3900, 4300, 4600, 5000, 5300, 5600, 5900, 6300], color: '#7bb77e' },
            { year: '2023', values: [1200, 1700, 2200, 2500, 2800, 3200, 3400, 3700, 3900, 4200, 4400, 4700], color: '#94a89a' },
            { year: '2022', values: [900, 1200, 1500, 1700, 2100, 2300, 2500, 2800, 3000, 3200, 3400, 3600], color: '#c4d1c4' },
        ];

        return {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
            series: allYears.filter(item => (
                Array.isArray(selectedYears)
                    ? selectedYears.includes(item.year)
                    : allYears.slice(0, Number(selectedYears) || 1).includes(item)
            )),
            years: allYears.map(item => item.year),
        };
    },

    getAnalyticsDepartments(filter = {}, legacyPeriod = null) {
        const hierarchy = typeof filter === 'string' ? {} : filter.hierarchy || {};
        const date = typeof filter === 'string' ? legacyPeriod || 'Month' : filter.date || {};
        const periodFactor = this.getDateFactor(date);
        const all = [
            ['Bangkhen', 'Computer Science', 'Faculty of Science', 45210, 6412.50],
            ['Bangkhen', 'Computer Engineering', 'Faculty of Engineering', 43880, 6120.75],
            ['Bangkhen', 'Data Science Institute', 'Faculty of Science', 38940, 5488.10],
            ['Kamphaeng Saen', 'Smart Farming Lab', 'Faculty of Agriculture', 31820, 4210.40],
            ['Siriracha', 'FinTech Research', 'Faculty of Management Sciences', 28470, 3990.00],
            ['Bangkhen', 'Business Analytics', 'Faculty of Business Administration', 25110, 3524.80],
            ['Siriracha', 'AI Manufacturing Lab', 'Faculty of Engineering at Sriracha', 22900, 3194.50],
            ['Bangkhen', 'Digital Archives', 'Library Services', 20350, 2862.70],
            ['Bangkhen', 'Statistics', 'Faculty of Science', 18120, 2536.80],
            ['Kamphaeng Saen', 'EdTech Research', 'Faculty of Education and Development Sciences', 16240, 2270.00],
            ['Kamphaeng Saen', 'Crop Science', 'Faculty of Agriculture', 14890, 2086.30],
            ['Siriracha', 'Logistics Analytics', 'Faculty of Management Sciences', 13220, 1850.80],
            ['Bangkhen', 'Electrical Engineering', 'Faculty of Engineering', 12840, 1797.60],
            ['Bangkhen', 'Marketing', 'Faculty of Business Administration', 10950, 1533.00],
            ['Bangkhen', 'Learning Innovation', 'Library Services', 9680, 1355.20],
            ['Kamphaeng Saen', 'Curriculum Innovation', 'Faculty of Education and Development Sciences', 8420, 1178.80],
            ['Bangkhen', 'Industrial Engineering', 'Faculty of Engineering', 7890, 1104.60],
            ['Siriracha', 'Automation Engineering', 'Faculty of Engineering at Sriracha', 7240, 1013.60],
        ];

        return all.map(([campus, name, faculty, tokens, cost]) => ({
            campus,
            name,
            faculty,
            department: name,
            totalModelsUsed: Math.round(tokens * periodFactor),
            coinConsumption: Number((cost * periodFactor).toFixed(2)),
        })).filter(row => this.matchesHierarchy(row, hierarchy));
    },

    getBehaviorData(filter = {}) {
        const date = typeof filter === 'string' ? filter : filter.date || {};
        const hierarchy = typeof filter === 'string' ? {} : filter.hierarchy || {};
        const factor = this.getDateFactor(date) * Math.max(0.08, this.getHierarchyShare(hierarchy));
        const baseUsers = [1100, 1400, 2400, 2000, 3700, 3300, 4300, 3950, 5150, 5842];
        return {
            totalNotes: Math.round(142853 * factor),
            change: factor > 2 ? '+31.7%' : factor > 1 ? '+18.1%' : '+12.4%',
            activeUsers: baseUsers.map((users, index) => ({
                day: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun', 'Mon', 'Tue', 'Wed'][index],
                users: Math.round(users * Math.min(factor, 2.2)),
            })),
            tags: this.getPopularTags(typeof date === 'string' ? date : date.mode === 'year' ? 'Year' : 'Month'),
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
