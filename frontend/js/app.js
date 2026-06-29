// Main App Module with interactive filters and mock data.
const App = {
    currentPage: 'dashboard',
    apiConnected: false,
    state: {
        dashboard: { scope: 'Faculty', period: 'Month' },
        consumption: {
            period: 'Month',
            compareYears: 1,
            hierarchy: { campus: 'All', faculty: 'All', department: 'All' },
        },
        analytics: { scope: 'Overview', period: 'Month', page: 1, pageSize: 7 },
        behavior: { period: '7 Days' },
    },

    async init() {
        await this.checkAPIHealth();
        window.addEventListener('hashchange', () => this.router());
        document.addEventListener('click', (event) => this.handleClick(event));
        document.addEventListener('change', (event) => this.handleChange(event));
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
        if (!statusEl || !statusText) return;

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
        this.updateActiveNavForPage(page);
        await this.render(page);
    },

    updateActiveNavForPage(page) {
        const navLink = document.querySelector(`.nav-link[href="#/${page}"]`);
        if (navLink) this.updateActiveNav(navLink);
    },

    updateActiveNav(link) {
        document.querySelectorAll('.nav-link').forEach(el => {
            el.classList.remove('active');
            el.classList.add('text-on-surface-variant', 'hover:bg-surface-container-high');
        });
        link.classList.remove('text-on-surface-variant', 'hover:bg-surface-container-high');
        link.classList.add('active');
    },

    handleClick(event) {
        const navLink = event.target.closest('.nav-link');
        if (navLink) {
            this.updateActiveNav(navLink);
            return;
        }

        const filterTab = event.target.closest('.filter-tab[data-page]');
        if (filterTab) {
            const { page, group, value } = filterTab.dataset;
            this.state[page][group] = value;
            if (page === 'analytics') this.state.analytics.page = 1;
            this.render(this.currentPage);
            return;
        }

        const pageButton = event.target.closest('.pagination-btn[data-page-number]');
        if (pageButton && !pageButton.disabled) {
            this.state.analytics.page = Number(pageButton.dataset.pageNumber);
            this.render('department');
        }
    },

    handleChange(event) {
        const compareSelect = event.target.closest('#compare-years');
        if (compareSelect) {
            this.state.consumption.compareYears = Number(compareSelect.value);
            this.render('api');
            return;
        }

        const hierarchySelect = event.target.closest('.hierarchy-filter');
        if (hierarchySelect) {
            const key = hierarchySelect.dataset.hierarchy;
            this.state.consumption.hierarchy[key] = hierarchySelect.value;

            if (key === 'campus') {
                this.state.consumption.hierarchy.faculty = 'All';
                this.state.consumption.hierarchy.department = 'All';
            }
            if (key === 'faculty') {
                this.state.consumption.hierarchy.department = 'All';
            }

            this.render('api');
        }
    },

    async render(page) {
        const container = document.getElementById('page-container');
        container.innerHTML = '<div class="flex items-center justify-center h-full"><span class="text-on-surface-variant">Loading...</span></div>';

        let content = '';
        switch (page) {
            case 'dashboard':
                content = this.createDashboardPage();
                break;
            case 'api':
                content = this.createConsumptionPage();
                break;
            case 'department':
                content = this.createAnalyticsPage();
                break;
            case 'behavior':
                content = this.createBehaviorPage();
                break;
            case 'settings':
                content = this.createSettingsPage();
                break;
            default:
                content = this.createDashboardPage();
        }

        container.innerHTML = content;
        setTimeout(() => this.initCharts(page), 50);
    },

    createKPICard(label, value, change, icon, type = 'neutral') {
        const changeColor = type === 'positive' ? 'text-primary' : type === 'negative' ? 'text-error' : 'text-on-surface-variant';
        const changeIcon = type === 'positive' ? 'trending_up' : type === 'negative' ? 'trending_down' : 'horizontal_rule';

        return `
            <div class="glass-panel rounded-lg p-lg min-h-[174px] flex flex-col justify-between group hover:border-primary transition-colors">
                <div class="flex justify-between items-start mb-md">
                    <span class="font-label-md text-label-md text-on-surface-variant uppercase">${label}</span>
                    <div class="w-8 h-8 rounded-full bg-secondary-container flex items-center justify-center text-primary shrink-0">
                        <span class="material-symbols-outlined text-[18px]">${icon}</span>
                    </div>
                </div>
                <div>
                    <div class="font-display-lg text-display-lg text-on-surface leading-none">${value}</div>
                    <div class="font-label-md ${changeColor} mt-xs flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">${changeIcon}</span> ${change}
                    </div>
                </div>
            </div>
        `;
    },

    createFilterGroup(items, activeLabel, page, group) {
        return `
            <div class="filter-group" role="group" aria-label="${group}">
                ${items.map(item => `
                    <button type="button" class="filter-tab ${item === activeLabel ? 'active' : ''}" data-page="${page}" data-group="${group}" data-value="${item}">
                        ${item}
                    </button>
                `).join('')}
            </div>
        `;
    },

    createTagPills(tags, featured = []) {
        return tags.map((tag, index) => {
            const label = typeof tag === 'string' ? tag : tag.tag || tag.modelName;
            const isFeatured = featured.includes(index) || featured.includes(label);
            const size = index < 2 ? 'px-lg py-md text-[20px]' : 'px-md py-sm text-body-md';
            return `<span class="tag-pill ${isFeatured ? 'featured' : ''} ${size}">${label}</span>`;
        }).join('');
    },

    createPageHeader(title, subtitle, filters = '') {
        return `
            <div class="flex justify-between items-end mb-gutter">
                <div>
                    <h2 class="font-headline-lg text-headline-lg text-on-surface mb-xs">${title}</h2>
                    <p class="font-body-md text-body-md text-on-surface-variant">${subtitle}</p>
                </div>
                ${filters}
            </div>
        `;
    },

    createSelect(id, label, options, selected, className = '', dataAttribute = '') {
        return `
            <label class="flex flex-col gap-xs">
                <span class="font-label-md text-label-md text-on-surface-variant">${label}</span>
                <select id="${id}" class="filter-select ${className}" ${dataAttribute}>
                    ${options.map(option => `<option value="${option}" ${option === selected ? 'selected' : ''}>${option}</option>`).join('')}
                </select>
            </label>
        `;
    },

    createDashboardPage() {
        const { scope, period } = this.state.dashboard;
        const data = MockData.getDashboardData(scope, period);
        const scopeFilters = this.createFilterGroup(['Overview', 'Faculty', 'Department'], scope, 'dashboard', 'scope');
        const timeFilters = this.createFilterGroup(['7 Days', 'Month', 'Year', 'Custom'], period, 'dashboard', 'period');

        return `
            ${this.createPageHeader(
                'Dashboard Overview',
                'System performance and usage metrics for KUCSGenAI.',
                `<div class="flex gap-md">${scopeFilters}${timeFilters}</div>`
            )}

            <div class="grid grid-cols-4 gap-gutter mb-gutter">
                ${data.kpis.map(k => this.createKPICard(k.label, k.value, k.change, k.icon, k.type)).join('')}
            </div>

            <div class="bento-grid">
                <div class="col-span-8 glass-panel rounded-lg p-lg">
                    <div class="flex justify-between items-center mb-lg">
                        <h3 class="font-title-lg text-title-lg text-on-surface">Monthly Transaction Trends</h3>
                        <span class="material-symbols-outlined text-on-surface-variant">more_horiz</span>
                    </div>
                    <div class="chart-container-lg border border-outline-variant rounded p-md">
                        <canvas id="monthlyChart"></canvas>
                    </div>
                </div>
                <div class="col-span-4 self-start glass-panel rounded-lg p-lg">
                    <div class="flex justify-between items-center mb-md">
                        <h3 class="font-title-lg text-title-lg text-on-surface">Trending Note Topics</h3>
                        <span class="font-headline-md text-headline-md text-on-surface">#</span>
                    </div>
                    <div class="flex flex-wrap gap-sm" id="trending-topics">
                        ${this.createTagPills(data.topics, [0, 2, 4])}
                    </div>
                </div>
            </div>
        `;
    },

    createConsumptionPage() {
        const { period, compareYears, hierarchy } = this.state.consumption;
        const costs = { currentBillingCycle: 4285.50, projectedEndOfMonth: 5100, usageChange: -120, cachingSavings: 8 };
        const hierarchyRows = MockData.getHierarchyData(hierarchy);
        const timeFilters = this.createFilterGroup(['7 Days', 'Month', 'Year', 'Custom'], period, 'consumption', 'period');
        const facultyOptions = this.getHierarchyFaculties(hierarchy.campus);
        const departmentOptions = this.getHierarchyDepartments(hierarchy.campus, hierarchy.faculty);

        return `
            ${this.createPageHeader(
                'Consumption',
                'Monitor token and Coin consumption across models and campus hierarchies.',
                timeFilters
            )}

            <div class="bento-grid mb-gutter">
                <div class="col-span-8 glass-panel rounded-lg p-lg">
                    <div class="flex justify-between items-start mb-md">
                        <div>
                            <h3 class="font-title-lg text-title-lg text-on-surface">Model Token Consumption</h3>
                            <p class="font-label-md text-label-md text-on-surface-variant mt-xs">Distribution of tokens used by model</p>
                        </div>
                        <span class="material-symbols-outlined text-on-surface-variant">more_vert</span>
                    </div>
                    <div class="grid grid-cols-[1fr_190px] gap-lg items-center">
                        <div class="chart-container-lg">
                            <canvas id="modelChart"></canvas>
                        </div>
                        <div class="space-y-md">
                            ${MockData.getModelTokenConsumption().map(item => `
                                <div class="flex items-start gap-sm">
                                    <span class="w-3 h-3 rounded-full mt-1.5 shrink-0" style="background-color: ${item.color};"></span>
                                    <div>
                                        <div class="font-label-md text-label-md text-on-surface">${item.modelName}</div>
                                        <div class="font-body-md text-body-md text-on-surface-variant">${item.tokens} Tokens</div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <div class="col-span-4 grid gap-gutter">
                    <div class="glass-panel rounded-lg p-lg">
                        <h3 class="font-title-lg text-title-lg text-primary mb-lg flex items-center gap-sm">
                            <span class="material-symbols-outlined">toll</span> Coin Consumption
                        </h3>
                        <p class="font-label-md text-label-md text-on-surface-variant mb-md">Current Month-to-Date</p>
                        <div class="font-display-lg text-display-lg text-on-surface mb-xl">${costs.currentBillingCycle.toLocaleString()} <span class="text-headline-md">Coin</span></div>
                        <div class="pt-md border-t border-outline-variant flex justify-between items-center">
                            <span class="font-label-md text-label-md text-tertiary">Projected End of Month</span>
                            <span class="font-title-lg text-title-lg text-on-surface">~${costs.projectedEndOfMonth.toLocaleString()} Coin</span>
                        </div>
                    </div>

                    <div class="rounded-lg p-lg bg-secondary-container border border-outline-variant min-h-[180px]">
                        <p class="font-label-md text-label-md text-on-surface-variant mb-md">Usage Change</p>
                        <div class="font-headline-lg text-headline-lg text-primary mb-md">${costs.usageChange > 0 ? '+' : '-'}${Math.abs(costs.usageChange)} Coin <span class="font-body-lg text-body-lg text-on-surface-variant">vs last month</span></div>
                        <div class="h-2 bg-surface-container-high rounded-full overflow-hidden mb-sm">
                            <div class="h-full bg-primary rounded-full" style="width: 68%;"></div>
                        </div>
                        <p class="font-body-md text-body-md text-on-surface-variant">Caching saved ~${costs.cachingSavings}% this period.</p>
                    </div>
                </div>
            </div>

            <div class="glass-panel rounded-lg p-lg mb-gutter">
                <div class="flex justify-between items-center mb-md">
                    <div>
                        <h3 class="font-title-lg text-title-lg text-on-surface">Monthly Tokens Used</h3>
                        <p class="font-label-md text-label-md text-on-surface-variant mt-xs">Compare token volume across up to 5 years.</p>
                    </div>
                    ${this.createSelect('compare-years', 'Compare Years', ['1', '2', '3', '4', '5'], String(compareYears))}
                </div>
                <div class="chart-container">
                    <canvas id="apiMonthlyChart"></canvas>
                </div>
            </div>

            <div class="glass-panel rounded-lg overflow-hidden">
                <div class="flex justify-between items-start p-lg gap-lg">
                    <div>
                        <h3 class="font-title-lg text-title-lg text-on-surface">Usage by Hierarchy</h3>
                        <p class="font-label-md text-label-md text-on-surface-variant mt-xs">Filter by campus, faculty/division, then department/unit.</p>
                    </div>
                    <div class="flex gap-sm items-end">
                        ${this.createSelect('campus-filter', 'วิทยาเขต', MockData.campuses, hierarchy.campus, 'hierarchy-filter', 'data-hierarchy="campus"')}
                        ${this.createSelect('faculty-filter', 'คณะ/ส่วนงาน', facultyOptions, hierarchy.faculty, 'hierarchy-filter', 'data-hierarchy="faculty"')}
                        ${this.createSelect('department-filter', 'ภาควิชา/หน่วยงาน', departmentOptions, hierarchy.department, 'hierarchy-filter', 'data-hierarchy="department"')}
                    </div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-body-md data-table">
                        <thead>
                            <tr>
                                <th class="text-left">Campus (วิทยาเขต)</th>
                                <th class="text-left">Faculty/Division (คณะ/ส่วนงาน)</th>
                                <th class="text-left">Department/Unit (ภาควิชา/หน่วยงาน)</th>
                                <th class="text-right">Tokens Used</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${hierarchyRows.map(row => `
                                <tr>
                                    <td>${row.campus}</td>
                                    <td>${row.faculty}</td>
                                    <td>${row.department}</td>
                                    <td class="text-right">${row.tokensUsed.toLocaleString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    createAnalyticsPage() {
        const { scope, period, page, pageSize } = this.state.analytics;
        const departments = MockData.getAnalyticsDepartments(scope, period);
        const totalPages = Math.max(1, Math.ceil(departments.length / pageSize));
        if (this.state.analytics.page > totalPages) this.state.analytics.page = totalPages;
        const currentPage = this.state.analytics.page;
        const start = (currentPage - 1) * pageSize;
        const rows = departments.slice(start, start + pageSize);
        const scopeFilters = this.createFilterGroup(['Overview', 'Faculty', 'Department'], scope, 'analytics', 'scope');
        const timeFilters = this.createFilterGroup(['7 Days', 'Month', 'Year'], period, 'analytics', 'period');

        return `
            <div class="flex justify-between items-end mb-gutter">
                <div class="flex gap-md">
                    <div>
                        <div class="font-label-md text-label-md text-on-surface-variant mb-xs">Scope</div>
                        ${scopeFilters}
                    </div>
                    <div>
                        <div class="font-label-md text-label-md text-on-surface-variant mb-xs">Time Period</div>
                        ${timeFilters}
                    </div>
                </div>
                <button class="flex items-center gap-sm px-md py-sm rounded bg-secondary-container text-primary font-label-md text-label-md">
                    <span class="material-symbols-outlined text-[18px]">download</span> Export Data
                </button>
            </div>

            <div class="bento-grid mb-gutter">
                <div class="col-span-5 grid grid-cols-2 gap-gutter">
                    ${this.createKPICard('Total Transactions', this.formatCompact(departments.reduce((sum, item) => sum + item.totalModelsUsed, 0)), '+15.3% from last month', 'query_stats', 'positive')}
                    ${this.createKPICard('Active Users', '8,432', '+4.2% from last month', 'group', 'positive')}
                    <div class="col-span-2 rounded-lg p-lg min-h-[190px] bg-[#e2f8e2] border border-[#d5ecd5] relative overflow-hidden">
                        <span class="material-symbols-outlined absolute right-6 top-1/2 -translate-y-1/2 text-[120px] leading-none text-primary/10">toll</span>
                        <div class="relative">
                            <div class="flex justify-between items-start mb-lg">
                                <h3 class="font-title-lg text-title-lg text-on-surface">Coin Consumption</h3>
                                <span class="px-md py-xs rounded-full bg-secondary-container text-primary font-label-md text-label-md">${scope}</span>
                            </div>
                            <div class="font-display-lg text-display-lg text-[#12bd39]">${departments.reduce((sum, item) => sum + item.coinConsumption, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} <span class="text-headline-md">Coin</span></div>
                            <p class="font-label-md text-label-md text-on-surface-variant mt-sm">Consumed in selected period</p>
                        </div>
                    </div>
                </div>
                <div class="col-span-7 glass-panel rounded-lg p-lg flex flex-col">
                    <div class="flex justify-between items-center mb-md">
                        <h3 class="font-title-lg text-title-lg text-on-surface">Peak Usage Heatmap</h3>
                        <span class="material-symbols-outlined text-on-surface-variant">grid_on</span>
                    </div>
                    <div class="grid grid-cols-[48px_1fr] gap-sm min-h-[260px]">
                        <div class="grid grid-rows-[24px_repeat(7,1fr)] gap-1 font-label-md text-label-md text-on-surface-variant">
                            <span></span>
                            ${['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => `<span class="flex items-center justify-end pr-sm">${day}</span>`).join('')}
                        </div>
                        <div class="grid grid-rows-[24px_1fr] gap-1">
                            <div class="grid grid-cols-8 gap-1 text-center font-label-md text-label-md text-on-surface-variant">
                                ${['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00'].map(hour => `<span>${hour}</span>`).join('')}
                            </div>
                            <div id="heatmap-grid" class="grid gap-1 h-full" style="grid-template-columns: repeat(8, 1fr); grid-template-rows: repeat(7, 1fr);">
                                ${this.generateFullHeatmapGrid()}
                            </div>
                        </div>
                    </div>
                    <div class="mt-md grid grid-cols-[auto_1fr_auto] gap-sm items-center text-xs">
                        <span class="font-label-md text-label-md text-on-surface-variant">Low</span>
                        <div class="h-2 rounded-full bg-gradient-to-r from-[#dde8dd] via-[#7daa84] to-[#0d631b]"></div>
                        <span class="font-label-md text-label-md text-on-surface-variant">High</span>
                    </div>
                </div>
            </div>

            <div class="glass-panel rounded-lg overflow-hidden">
                <div class="flex justify-between items-center p-lg">
                    <h3 class="font-title-lg text-title-lg text-on-surface">Department Summary</h3>
                    <span class="font-label-md text-label-md text-on-surface-variant">Showing ${start + 1}-${Math.min(start + pageSize, departments.length)} of ${departments.length}</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-body-md data-table">
                        <thead>
                            <tr>
                                <th class="text-left">Department</th>
                                <th class="text-left">Faculty/Division</th>
                                <th class="text-left">Total Tokens Used</th>
                                <th class="text-left">Coin Consumption</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map(dept => `
                                <tr>
                                    <td class="font-semibold">${dept.name}</td>
                                    <td>${dept.faculty}</td>
                                    <td>${dept.totalModelsUsed.toLocaleString()}</td>
                                    <td>${dept.coinConsumption.toLocaleString()} Coin</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
            ${this.createAnalyticsPagination(totalPages, currentPage)}
        `;
    },

    createBehaviorPage() {
        const { period } = this.state.behavior;
        const data = MockData.getBehaviorData(period);
        const appDist = MockData.getTopAppDistribution();
        const timeFilters = this.createFilterGroup(['7 Days', 'Month', 'Year'], period, 'behavior', 'period');

        return `
            ${this.createPageHeader(
                'User Behavior Insights',
                'Analyze interaction patterns and content generation trends.',
                timeFilters
            )}

            <div class="bento-grid mb-gutter">
                <div class="col-span-4 glass-panel rounded-lg p-lg min-h-[330px] flex flex-col justify-between">
                    <div class="flex items-start gap-sm">
                        <span class="material-symbols-outlined text-primary">description</span>
                        <h3 class="font-title-lg text-title-lg text-on-surface">Total Notes Generated<br><span class="font-body-lg text-body-lg">Selected period only</span></h3>
                    </div>
                    <div>
                        <div class="font-display-lg text-display-lg text-primary mb-sm">${data.totalNotes.toLocaleString()}</div>
                        <div class="font-label-md text-label-md text-primary flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">trending_up</span> ${data.change} vs previous period
                        </div>
                    </div>
                </div>

                <div class="col-span-8 glass-panel rounded-lg p-lg">
                    <div class="flex justify-between items-start mb-xl">
                        <h3 class="font-title-lg text-title-lg text-on-surface flex items-center gap-sm">
                            <span class="text-primary">#</span> Popular Conversation Tags
                        </h3>
                        <span class="tag-pill px-sm py-xs text-label-md">Top 15</span>
                    </div>
                    <div class="flex flex-wrap gap-md">
                        ${this.createTagPills(data.tags.slice(0, 10), [0, 1, 3, 6, 9])}
                    </div>
                </div>
            </div>

            <div class="border-t border-outline-variant mb-gutter"></div>

            <div class="bento-grid">
                <div class="col-span-8 glass-panel rounded-lg p-lg">
                    <div class="flex justify-between items-center mb-md">
                        <h3 class="font-title-lg text-title-lg text-on-surface flex items-center gap-sm">
                            <span class="material-symbols-outlined text-primary">groups</span> Monthly Active Users
                        </h3>
                        <span class="font-label-md text-label-md text-on-surface-variant">Avg: ${Math.round(data.activeUsers.reduce((sum, item) => sum + item.users, 0) / data.activeUsers.length).toLocaleString()}/day</span>
                    </div>
                    <div class="chart-container">
                        <canvas id="dailyChart"></canvas>
                    </div>
                </div>
                <div class="col-span-4 glass-panel rounded-lg p-lg">
                    <h3 class="font-title-lg text-title-lg text-on-surface mb-md flex items-center gap-sm">
                        <span class="material-symbols-outlined text-primary">apps</span> Top Active Apps
                    </h3>
                    <div class="chart-container">
                        <canvas id="behaviorAppChart"></canvas>
                    </div>
                    <div class="space-y-sm mt-md">
                        ${appDist.map(app => `
                            <div class="flex justify-between items-center">
                                <span class="flex items-center gap-sm font-body-md text-body-md text-on-surface">
                                    <span class="w-3 h-3 rounded-full" style="background-color:${app.color};"></span>
                                    ${app.app}
                                </span>
                                <span class="font-label-md text-label-md text-on-surface-variant">${app.percentage}%</span>
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

            <div class="glass-panel rounded-lg p-lg">
                <h3 class="font-title-lg text-title-lg text-on-surface mb-lg">Dashboard Settings</h3>
                <p class="font-body-md text-body-md text-on-surface-variant">Settings page is under development.</p>
            </div>
        `;
    },

    getHierarchyFaculties(campus) {
        if (campus !== 'All') return MockData.facultiesByCampus[campus] || ['All'];
        return ['All', ...new Set(MockData.getHierarchyData().map(row => row.faculty))];
    },

    getHierarchyDepartments(campus, faculty) {
        if (faculty !== 'All') return MockData.departmentsByFaculty[faculty] || ['All'];
        return ['All', ...new Set(MockData.getHierarchyData({ campus }).map(row => row.department))];
    },

    createAnalyticsPagination(totalPages, currentPage) {
        const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, index) => index + 1);
        return `
            <div class="flex justify-center items-center gap-md mt-md text-body-lg">
                <button type="button" class="pagination-btn" data-page-number="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>
                ${pages.map(page => `<button type="button" class="pagination-btn ${page === currentPage ? 'active' : ''}" data-page-number="${page}">${page}</button>`).join('')}
                ${totalPages > 5 ? `<span>...</span><button type="button" class="pagination-btn" data-page-number="${totalPages}">${totalPages}</button>` : ''}
                <button type="button" class="pagination-btn" data-page-number="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>
            </div>
        `;
    },

    generateFullHeatmapGrid() {
        const colors = ['#dde8dd', '#bad0bd', '#8db394', '#4a8655', '#0d631b'];
        const pattern = [
            1, 1, 2, 1, 0, 0, 0, 0,
            3, 4, 3, 4, 2, 2, 2, 2,
            3, 4, 3, 4, 2, 2, 2, 2,
            2, 2, 1, 2, 0, 0, 0, 0,
            2, 2, 1, 2, 0, 0, 0, 0,
            2, 2, 1, 2, 0, 0, 0, 0,
            2, 2, 1, 2, 0, 0, 0, 0,
        ];
        return pattern.map(value => `<div class="w-full h-full min-h-[28px] rounded-sm" style="background-color: ${colors[value]};"></div>`).join('');
    },

    formatCompact(value) {
        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `${Math.round(value / 1000)}k`;
        return value.toLocaleString();
    },

    initCharts(page) {
        if (page === 'dashboard') {
            const { scope, period } = this.state.dashboard;
            const monthlyData = MockData.getDashboardData(scope, period).monthly;
            Charts.createBarChart(
                'monthlyChart',
                monthlyData.map(m => m.month),
                monthlyData.map(m => m.usage),
                'Monthly Usage',
                monthlyData.length - 1
            );
            return;
        }

        if (page === 'api') {
            const modelData = MockData.getModelTokenConsumption();
            Charts.createDoughnutChart(
                'modelChart',
                modelData.map(m => m.modelName),
                modelData.map(m => m.percentage),
                modelData.map(m => m.color),
                'Total Tokens:',
                '100M'
            );

            const tokenData = MockData.getMonthlyTokensByYears(this.state.consumption.compareYears);
            Charts.createMultiBarChart('apiMonthlyChart', tokenData.labels, tokenData.series);
            return;
        }

        if (page === 'behavior') {
            const behaviorData = MockData.getBehaviorData(this.state.behavior.period);
            Charts.createLineChart(
                'dailyChart',
                behaviorData.activeUsers.map(d => d.day),
                behaviorData.activeUsers.map(d => d.users),
                'Active Users'
            );

            const appData = MockData.getTopAppDistribution();
            Charts.createDoughnutChart(
                'behaviorAppChart',
                appData.map(a => a.app),
                appData.map(a => a.percentage),
                appData.map(a => a.color),
                '3',
                'Core Apps'
            );
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
