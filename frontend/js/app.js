// Main App Module with API Integration
const App = {
    currentPage: 'dashboard',
    apiConnected: false,

    async init() {
        // Check API health on startup
        await this.checkAPIHealth();
        
        // Set up event listeners
        window.addEventListener('hashchange', () => this.router());
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => this.updateActiveNav(e.target.closest('a')));
        });
        
        this.router();
    },

    async checkAPIHealth() {
        const response = await API.healthCheck();
        this.apiConnected = response !== null;
        this.updateAPIStatus();
    },

    updateAPIStatus() {
        const statusEl = document.getElementById('api-status');
        const statusText = document.getElementById('api-status-text');
        
        if (this.apiConnected) {
            statusEl.classList.remove('disconnected');
            statusEl.classList.add('connected');
            statusText.textContent = 'Backend Connected';
        } else {
            statusEl.classList.remove('connected');
            statusEl.classList.add('disconnected');
            statusText.textContent = 'Using Mock Data';
        }
    },

    async router() {
        const hash = window.location.hash.slice(1) || 'dashboard';
        const page = hash.replace(/^\//, '').split('/')[0] || 'dashboard';
        this.currentPage = page;
        await this.render(page);
    },

    updateActiveNav(link) {
        document.querySelectorAll('.nav-link').forEach(el => {
            el.classList.remove('bg-secondary-container', 'text-primary');
            el.classList.add('text-on-surface-variant', 'hover:bg-surface-container-high');
        });
        link.classList.remove('text-on-surface-variant', 'hover:bg-surface-container-high');
        link.classList.add('bg-secondary-container', 'text-primary');
    },

    async render(page) {
        const container = document.getElementById('page-container');
        container.innerHTML = '<div class="flex items-center justify-center h-full"><span class="text-on-surface-variant">Loading...</span></div>';
        
        let content = '';
        switch(page) {
            case 'dashboard':
                content = await this.createDashboardPage();
                break;
            case 'api':
                content = await this.createAPIPage();
                break;
            case 'department':
                content = await this.createDepartmentPage();
                break;
            case 'behavior':
                content = await this.createBehaviorPage();
                break;
            case 'settings':
                content = this.createSettingsPage();
                break;
            default:
                content = await this.createDashboardPage();
        }
        
        container.innerHTML = content;
        
        // Initialize charts after DOM update
        setTimeout(() => this.initCharts(page), 100);
    },

    createKPICard(label, value, change, icon, type = 'neutral') {
        const changeColor = type === 'positive' ? 'text-primary' : type === 'negative' ? 'text-error' : 'text-on-surface-variant';
        const changeIcon = type === 'positive' ? 'trending_up' : type === 'negative' ? 'trending_down' : 'horizontal_rule';
        
        return `
            <div class="col-span-3 glass-panel rounded-xl p-lg flex flex-col justify-between group hover:border-primary transition-colors">
                <div class="flex justify-between items-start mb-md">
                    <span class="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">${label}</span>
                    <div class="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-primary">
                        <span class="material-symbols-outlined text-[18px]">${icon}</span>
                    </div>
                </div>
                <div>
                    <div class="font-display-lg text-display-lg text-on-surface">${value}</div>
                    <div class="font-label-md ${changeColor} mt-xs flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">${changeIcon}</span> ${change}
                    </div>
                </div>
            </div>
        `;
    },

    createChartCard(title, chartId) {
        return `
            <div class="col-span-6 glass-panel rounded-xl p-lg">
                <div class="flex justify-between items-center mb-md">
                    <h3 class="font-title-lg text-title-lg text-on-surface">${title}</h3>
                    <span class="material-symbols-outlined text-on-surface-variant cursor-pointer hover:text-primary transition-colors">more_vert</span>
                </div>
                <div class="chart-container">
                    <canvas id="${chartId}"></canvas>
                </div>
            </div>
        `;
    },

    async createDashboardPage() {
        const metricsResponse = await API.getDashboardMetrics();
        const monthlyResponse = await API.getMonthlyUsage();
        const topicsResponse = await API.getTrendingTopics();

        // Use API data or fall back to mock data
        const mockKpis = MockData.getKPIData().dashboard;
        const kpis = mockKpis;
        const kpiCards = kpis.map(k => this.createKPICard(k.label, k.value, k.change, k.icon, k.type)).join('');
        
        const topics = topicsResponse?.data || MockData.getTrendingTopics();

        return `
            <div class="flex justify-between items-end mb-gutter">
                <div>
                    <h2 class="font-headline-lg text-headline-lg text-on-surface mb-xs">Dashboard Overview</h2>
                    <p class="font-body-md text-body-md text-on-surface-variant">System performance and usage metrics for KUCSGenAI.</p>
                </div>
            </div>

            <div class="bento-grid mb-gutter">
                ${kpiCards}
            </div>

            <div class="bento-grid">
                ${this.createChartCard('Monthly Usage Trends', 'monthlyChart')}
                <div class="col-span-6 self-start glass-panel rounded-xl p-lg">
                    <div class="flex justify-between items-center mb-md">
                        <h3 class="font-title-lg text-title-lg text-on-surface">Trending Topics</h3>
                        <span class="material-symbols-outlined">tag</span>
                    </div>
                    <div class="flex flex-wrap gap-md" id="trending-topics">
                        ${topics.map((t, i) => `
                            <span class="px-lg py-sm rounded-full bg-primary text-on-primary font-label-md text-label-md">
                                ${typeof t === 'string' ? t : t.tag || t.modelName}
                            </span>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    async createAPIPage() {
        const costResponse = await API.getCosts();
        const hierarchyResponse = await API.getHierarchyData();
        const modelResponse = await API.getModelConsumption();

        const costs = costResponse?.data || { currentBillingCycle: 4285.50, projectedEndOfMonth: 5100, costEfficiency: -120, cachingSavings: 8 };
        const hierarchy = hierarchyResponse?.data || MockData.getHierarchyData();
        const models = modelResponse?.data || MockData.getModelTokenConsumption().map((m, i) => ({ modelName: m.modelName, percentage: m.percentage }));

        return `
            <div class="flex justify-between items-end mb-gutter">
                <div>
                    <h2 class="font-headline-lg text-headline-lg text-on-surface mb-xs">API Management</h2>
                    <p class="font-body-md text-body-md text-on-surface-variant">Monitor API token usage and estimated billing across models and campus hierarchies.</p>
                </div>
            </div>

            <div class="bento-grid mb-gutter">
                <div class="col-span-6 glass-panel rounded-xl p-lg">
                    <div class="flex justify-between items-center mb-md">
                        <h3 class="font-title-lg text-title-lg text-on-surface">Model Token Consumption</h3>
                        <span class="material-symbols-outlined text-on-surface-variant">more_vert</span>
                    </div>
                    <div class="chart-container">
                        <canvas id="modelChart"></canvas>
                    </div>
                </div>

                <div class="col-span-6 glass-panel rounded-xl p-lg">
                    <h3 class="font-title-lg text-title-lg text-primary mb-lg flex items-center gap-md">
                        <span class="material-symbols-outlined">check_circle</span> Estimated Cost
                    </h3>
                    <div class="space-y-md">
                        <div class="flex justify-between items-center pb-md border-b border-outline-variant">
                            <span class="font-body-md text-body-md text-on-surface-variant">Current Billing Cycle (Month-to-Date)</span>
                            <span class="font-headline-md text-headline-md text-on-surface font-bold">$${costs.currentBillingCycle.toLocaleString()}</span>
                        </div>
                        <div class="flex justify-between items-center pb-md border-b border-outline-variant">
                            <span class="font-body-md text-body-md text-on-surface-variant">Projected End of Month</span>
                            <span class="font-headline-md text-headline-md text-error font-bold">-$${costs.projectedEndOfMonth.toLocaleString()}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="font-body-md text-body-md text-on-surface-variant">Cost Efficiency</span>
                            <span class="font-headline-md text-headline-md text-primary font-bold">-$${Math.abs(costs.costEfficiency)}</span>
                        </div>
                        <div class="mt-md p-md bg-primary/10 border border-primary rounded-lg">
                            <p class="font-body-md text-body-md text-primary">Caching saved ~${costs.cachingSavings}% this period.</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="col-span-12 glass-panel rounded-xl p-lg">
                <div class="flex justify-between items-center mb-lg">
                    <h3 class="font-title-lg text-title-lg text-on-surface">Usage by Hierarchy</h3>
                    <button class="flex items-center gap-md px-md py-sm rounded-lg bg-primary text-on-primary font-label-md text-label-md hover:bg-primary/90 transition-colors">
                        <span class="material-symbols-outlined">download</span> Export CSV
                    </button>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-body-md">
                        <thead>
                            <tr class="border-b border-outline-variant">
                                <th class="text-left py-md px-md font-label-md text-label-md text-on-surface-variant uppercase">Campus (Venue)</th>
                                <th class="text-left py-md px-md font-label-md text-label-md text-on-surface-variant uppercase">Faculty/Division (Facility)</th>
                                <th class="text-left py-md px-md font-label-md text-label-md text-on-surface-variant uppercase">Department/Unit (Units/Venues)</th>
                                <th class="text-left py-md px-md font-label-md text-label-md text-on-surface-variant uppercase">Tokens Used</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${hierarchy.map(row => `
                                <tr class="border-b border-surface-container hover:bg-surface-container-low transition-colors">
                                    <td class="py-md px-md text-body-md text-on-surface">${row.campus}</td>
                                    <td class="py-md px-md text-body-md text-on-surface">${row.faculty}</td>
                                    <td class="py-md px-md text-body-md text-on-surface">${row.department}</td>
                                    <td class="py-md px-md text-body-md text-on-surface font-semibold">${(row.tokensUsed / 1000000).toFixed(1)}M</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async createDepartmentPage() {
        const kpisResponse = await API.getDepartmentKPIs();
        const summaryResponse = await API.getDepartmentSummary();
        const growthResponse = await API.getGrowthData();
        const heatmapResponse = await API.getHeatmapData();

        const mockKpis = MockData.getKPIData().department;
        const kpis = mockKpis;
        const departments = summaryResponse?.data || MockData.getDepartmentData();
        const growthData = growthResponse?.data || MockData.getMonthlyGrowthData();

        return `
            <div class="flex justify-between items-end mb-gutter">
                <div>
                    <h2 class="font-headline-lg text-headline-lg text-on-surface mb-xs">Faculty & Department Analytics</h2>
                    <p class="font-body-md text-body-md text-on-surface-variant">Analyze query patterns and compute allocation across departments.</p>
                </div>
            </div>

            <div class="bento-grid mb-gutter">
                ${kpis.map(k => this.createKPICard(k.label, k.value, k.change, k.icon, k.type)).join('')}
            </div>

            <div class="bento-grid mb-gutter">
                ${this.createChartCard('Monthly Growth Trends', 'growthChart')}
                <div class="col-span-6 glass-panel rounded-xl p-lg flex flex-col">
                    <div class="flex justify-between items-center mb-md">
                        <h3 class="font-title-lg text-title-lg text-on-surface">Peak Usage Heatmap</h3>
                        <span class="material-symbols-outlined">grid_on</span>
                    </div>
                    <div class="grid grid-cols-[1fr_auto] gap-md flex-1 min-h-[260px]">
                        <div class="grid grid-rows-[auto_1fr] gap-sm min-w-0">
                            <div class="grid grid-cols-7 text-xs font-label-md text-on-surface-variant text-center">
                                <span>M</span>
                                <span>T</span>
                                <span>W</span>
                                <span>T</span>
                                <span>F</span>
                                <span>S</span>
                                <span>S</span>
                            </div>
                            <div id="heatmap-grid" class="grid gap-2 h-full" style="grid-template-columns: repeat(7, 1fr); grid-template-rows: repeat(4, 1fr);">
                                ${this.generateHeatmapGrid()}
                            </div>
                        </div>
                        <div class="grid grid-rows-4 gap-2 pt-6 text-xs font-label-md text-on-surface-variant">
                            <div class="flex items-center">9a</div>
                            <div class="flex items-center">12p</div>
                            <div class="flex items-center">3p</div>
                            <div class="flex items-center">8p</div>
                        </div>
                    </div>
                    <div class="mt-md flex items-center justify-between text-xs">
                        <span class="font-label-md text-label-md text-on-surface-variant">Low</span>
                        <div class="flex gap-1">
                            <div class="w-3 h-3 rounded" style="background-color: #e0e8e0;"></div>
                            <div class="w-3 h-3 rounded" style="background-color: #a3f69c;"></div>
                            <div class="w-3 h-3 rounded" style="background-color: #2e7d32;"></div>
                            <div class="w-3 h-3 rounded" style="background-color: #0d631b;"></div>
                        </div>
                        <span class="font-label-md text-label-md text-on-surface-variant">High</span>
                    </div>
                </div>
            </div>

            <div class="col-span-12 glass-panel rounded-xl p-lg">
                <div class="flex justify-between items-center mb-lg">
                    <h3 class="font-title-lg text-title-lg text-on-surface">Department Summary</h3>
                    <a href="#" class="font-label-md text-label-md text-primary hover:text-primary/80 transition-colors">View Detailed Report -></a>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-body-md">
                        <thead>
                            <tr class="border-b border-outline-variant">
                                <th class="text-left py-md px-md font-label-md text-label-md text-on-surface-variant uppercase">Department</th>
                                <th class="text-left py-md px-md font-label-md text-label-md text-on-surface-variant uppercase">Total Models Used</th>
                                <th class="text-left py-md px-md font-label-md text-label-md text-on-surface-variant uppercase">Compute Share</th>
                                <th class="text-left py-md px-md font-label-md text-label-md text-on-surface-variant uppercase">Cost Allocation</th>
                                <th class="text-left py-md px-md font-label-md text-label-md text-on-surface-variant uppercase">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${departments.map(dept => `
                                <tr class="border-b border-surface-container hover:bg-surface-container-low transition-colors">
                                    <td class="py-md px-md text-body-md text-on-surface">${dept.name}</td>
                                    <td class="py-md px-md text-body-md text-on-surface">${dept.totalModelsUsed.toLocaleString()}</td>
                                    <td class="py-md px-md">
                                        <div class="flex items-center gap-md">
                                            <div class="flex-1 h-2 bg-surface-container rounded-full overflow-hidden">
                                                <div class="h-full bg-primary" style="width: ${dept.computeShare}%"></div>
                                            </div>
                                            <span class="font-label-md text-label-md text-on-surface-variant">${dept.computeShare}%</span>
                                        </div>
                                    </td>
                                    <td class="py-md px-md text-body-md text-on-surface">$${dept.costAllocation.toLocaleString()}</td>
                                    <td class="py-md px-md">
                                        <span class="px-md py-xs rounded-full font-label-md text-label-md ${dept.statusColor || 'bg-primary'} text-on-primary text-xs">
                                            ${dept.status || 'Active'}
                                        </span>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    async createBehaviorPage() {
        const kpiResponse = await API.getBehaviorKPI();
        const tagsResponse = await API.getTrendingTags();
        const dailyResponse = await API.getDailyUsers();
        const appResponse = await API.getAppDistribution();

        const mockKpis = MockData.getKPIData().behavior;
        const tags = tagsResponse?.data || MockData.getPopularTags();
        const dailyUsers = dailyResponse?.data || MockData.getDailyActiveUsers();
        const appDist = appResponse?.data || MockData.getTopAppDistribution();

        return `
            <div class="flex justify-between items-end mb-gutter">
                <div>
                    <h2 class="font-headline-lg text-headline-lg text-on-surface mb-xs">User Behavior Insights</h2>
                    <p class="font-body-md text-body-md text-on-surface-variant">Analyze interaction patterns and content generation trends.</p>
                </div>
            </div>

            <div class="bento-grid mb-gutter">
                <div class="col-span-3 glass-panel rounded-xl p-lg">
                    <div class="flex items-start justify-between mb-md">
                        <span class="font-label-md text-label-md text-on-surface-variant uppercase">Total Notes Generated</span>
                        <span class="material-symbols-outlined text-primary">description</span>
                    </div>
                    <div class="font-display-lg text-display-lg text-on-surface mb-md">${mockKpis[0].value}</div>
                    <div class="font-label-md text-label-md text-primary flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">trending_up</span> ${mockKpis[0].change}
                    </div>
                </div>

                <div class="col-span-9 glass-panel rounded-xl p-lg">
                    <div class="flex justify-between items-center mb-md">
                        <h3 class="font-title-lg text-title-lg text-on-surface">Popular Conversation Tags</h3>
                        <span class="font-label-md text-label-md text-on-surface-variant">Top 15</span>
                    </div>
                    <div class="flex flex-wrap gap-md">
                        ${tags.slice(0, 10).map(tag => `
                            <span class="px-lg py-sm rounded-full bg-primary text-on-primary font-label-md text-label-md">
                                ${tag}
                            </span>
                        `).join('')}
                    </div>
                </div>
            </div>

            <div class="bento-grid">
                ${this.createChartCard('Daily Active Users', 'dailyChart')}
                <div class="col-span-6 glass-panel rounded-xl p-lg">
                    <div class="flex justify-between items-center mb-md">
                        <h3 class="font-title-lg text-title-lg text-on-surface">Top Apps Distribution</h3>
                    </div>
                    <div class="space-y-md">
                        ${appDist.map((app, idx) => `
                            <div>
                                <div class="flex justify-between mb-xs">
                                    <span class="font-body-md text-body-md text-on-surface">${app.app || app.appName}</span>
                                    <span class="font-label-md text-label-md text-on-surface-variant">${app.percentage}%</span>
                                </div>
                                <div class="h-2 bg-surface-container rounded-full overflow-hidden">
                                    <div class="h-full" style="background-color: ${app.color || '#0d631b'}; width: ${app.percentage}%"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    },

    createSettingsPage() {
        return `
            <div class="flex justify-between items-end mb-gutter">
                <div>
                    <h2 class="font-headline-lg text-headline-lg text-on-surface mb-xs">Settings</h2>
                    <p class="font-body-md text-body-md text-on-surface-variant">Manage your dashboard preferences and configuration.</p>
                </div>
            </div>

            <div class="col-span-12 glass-panel rounded-xl p-lg">
                <h3 class="font-title-lg text-title-lg text-on-surface mb-lg">Dashboard Settings</h3>
                <div class="space-y-lg">
                    <div class="pb-lg border-b border-outline-variant">
                        <h4 class="font-body-lg text-body-lg text-on-surface mb-sm">Preferences</h4>
                        <p class="font-body-md text-body-md text-on-surface-variant">Settings page is under development. More features coming soon!</p>
                    </div>
                </div>
            </div>
        `;
    },

    generateHeatmapGrid() {
        const colors = ['#e0e8e0', '#a3f69c', '#2e7d32', '#0d631b'];
        let html = '';
        for (let i = 0; i < 28; i++) {
            const intensity = Math.floor(Math.random() * 4);
            html += `<div class="w-full h-full rounded" style="background-color: ${colors[intensity]};"></div>`;
        }
        return html;
    },

    initCharts(page) {
        if (page === 'dashboard') {
            const monthlyData = MockData.getMonthlyUsageData();
            Charts.createBarChart(
                'monthlyChart',
                monthlyData.map(m => m.month),
                monthlyData.map(m => m.usage),
                'Monthly Usage',
                5
            );
        } else if (page === 'api') {
            const modelData = MockData.getModelTokenConsumption();
            Charts.createDoughnutChart(
                'modelChart',
                modelData.map(m => m.modelName),
                modelData.map(m => m.percentage),
                modelData.map(m => m.color)
            );
        } else if (page === 'department') {
            const growthData = MockData.getMonthlyGrowthData();
            Charts.createGroupedBarChart(
                'growthChart',
                growthData.map(g => g.month),
                growthData.map(g => g.cs),
                growthData.map(g => g.bio),
                'CS',
                'Bio'
            );
        } else if (page === 'behavior') {
            const dailyData = MockData.getDailyActiveUsers();
            Charts.createLineChart(
                'dailyChart',
                dailyData.map(d => d.day),
                dailyData.map(d => d.users),
                'Daily Active Users'
            );
        }
    }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
