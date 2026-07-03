// Main App Module with interactive filters and mock data.
const App = {
    currentPage: 'dashboard',
    apiConnected: false,
    currentDataMode: 'checking',
    openDropdown: null,
    liveData: {},
    state: {
        dashboard: {
            filter: {
                hierarchy: { campuses: [], faculties: [], departments: [] },
                date: { mode: 'month', month: 6, year: 2026, range: [] },
            },
        },
        consumption: {
            filter: {
                hierarchy: { campuses: [], faculties: [], departments: [] },
                date: { mode: 'month', month: 6, year: 2026, range: [] },
            },
            selectedYears: ['2026'],
            drilldownApp: null,
            hierarchyPage: 1,
            hierarchyPageSize: 7,
        },
        analytics: {
            filter: {
                hierarchy: { campuses: [], faculties: [], departments: [] },
                date: { mode: 'month', month: 6, year: 2026, range: [] },
            },
            page: 1,
            pageSize: 7,
        },
        behavior: {
            filter: {
                hierarchy: { campuses: [], faculties: [], departments: [] },
                date: { mode: 'month', month: 6, year: 2026, range: [] },
            },
        },
        settings: {
            theme: 'forest',
            compactTables: false,
            schedule: null,
            scheduleLoading: false,
            scheduleAttempted: false,
            message: '',
            messageType: 'neutral',
        },
    },

    async init() {
        await this.checkAPIHealth();
        window.addEventListener('hashchange', () => this.router());
        document.addEventListener('click', (event) => this.handleClick(event));
        document.addEventListener('change', (event) => this.handleChange(event));
        document.body.dataset.theme = this.state.settings.theme;
        this.router();
    },

    async checkAPIHealth() {
        const response = await API.healthCheck();
        this.apiConnected = response !== null;
        if (this.apiConnected) {
            const context = await API.getDashboardMetrics();
            const dataAsOf = context?.dataAsOf;
            ['dashboard', 'consumption', 'analytics', 'behavior']
                .forEach(page => this.applyLiveDataAsOf(page, dataAsOf));
        }
        this.updateAPIStatus();
    },

    updateAPIStatus() {
        const statusEl = document.getElementById('api-status');
        const statusText = document.getElementById('api-status-text');
        if (!statusEl || !statusText) return;

        if (this.apiConnected && this.currentDataMode !== 'unavailable') {
            statusEl.classList.remove('disconnected');
            statusEl.classList.add('connected');
            statusText.textContent = this.currentDataMode === 'live' ? 'Live Database' : 'Backend Connected';
        } else {
            statusEl.classList.remove('connected');
            statusEl.classList.add('disconnected');
            statusText.textContent = 'Database Unavailable';
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

        const dropdownToggle = event.target.closest('[data-dropdown-toggle]');
        if (dropdownToggle) {
            const dropdownId = dropdownToggle.dataset.dropdownToggle;
            this.openDropdown = this.openDropdown === dropdownId ? null : dropdownId;
            document.querySelectorAll('.filter-popover').forEach(popover => {
                popover.hidden = popover.id !== this.openDropdown;
            });
            return;
        }

        const pageButton = event.target.closest('.pagination-btn[data-page-number]');
        if (pageButton && !pageButton.disabled) {
            const target = pageButton.dataset.paginationTarget || 'analytics';
            if (target === 'analytics') this.state.analytics.page = Number(pageButton.dataset.pageNumber);
            if (target === 'consumption') this.state.consumption.hierarchyPage = Number(pageButton.dataset.pageNumber);
            this.render(target === 'analytics' ? 'department' : 'api');
            return;
        }

        const clearHierarchy = event.target.closest('[data-clear-hierarchy]');
        if (clearHierarchy) {
            const page = clearHierarchy.dataset.clearHierarchy;
            this.state[page].filter.hierarchy = { campuses: [], faculties: [], departments: [] };
            this.resetPage(page);
            this.render(this.currentPage);
            return;
        }

        const appDrilldown = event.target.closest('[data-app-drilldown]');
        if (appDrilldown) {
            this.state.consumption.drilldownApp = appDrilldown.dataset.appDrilldown;
            this.render('api');
            return;
        }

        if (event.target.closest('[data-app-back]')) {
            this.state.consumption.drilldownApp = null;
            this.render('api');
            return;
        }

        if (event.target.closest('#export-analytics')) {
            this.exportAnalytics();
            return;
        }

        const themeButton = event.target.closest('[data-theme-value]');
        if (themeButton) {
            this.state.settings.theme = themeButton.dataset.themeValue;
            document.body.dataset.theme = this.state.settings.theme;
            this.render('settings');
            return;
        }

        if (event.target.closest('#schedule-refresh')) {
            this.loadSchedule(true);
            return;
        }
        if (event.target.closest('#schedule-save')) {
            this.saveSchedule();
            return;
        }
        if (event.target.closest('#schedule-run')) {
            this.runSyncNow();
            return;
        }

        if (!event.target.closest('.filter-dropdown')) {
            this.openDropdown = null;
            document.querySelectorAll('.filter-popover').forEach(popover => {
                popover.hidden = true;
            });
        }
    },

    handleChange(event) {
        const hierarchyCheckbox = event.target.closest('[data-hierarchy-level]');
        if (hierarchyCheckbox) {
            const { filterPage, hierarchyLevel, filterValue } = hierarchyCheckbox.dataset;
            const hierarchy = this.state[filterPage].filter.hierarchy;
            const values = hierarchy[hierarchyLevel];
            if (hierarchyCheckbox.checked) values.push(filterValue);
            else hierarchy[hierarchyLevel] = values.filter(value => value !== filterValue);
            this.pruneHierarchy(filterPage, hierarchyLevel);
            this.resetPage(filterPage);
            this.openDropdown = `hierarchy-${filterPage}`;
            this.render(this.currentPage);
            return;
        }

        const dateSelect = event.target.closest('[data-date-field]');
        if (dateSelect) {
            const { filterPage, dateField } = dateSelect.dataset;
            const date = this.state[filterPage].filter.date;
            date[dateField] = dateField === 'month' || dateField === 'year'
                ? Number(dateSelect.value)
                : dateSelect.value;
            if (dateField !== 'mode') date.mode = date.mode === 'custom' ? 'month' : date.mode;
            date.range = [];
            this.resetPage(filterPage);
            this.render(this.currentPage);
            return;
        }

        const yearCheckbox = event.target.closest('[data-compare-year]');
        if (yearCheckbox) {
            const year = yearCheckbox.dataset.compareYear;
            const selected = this.state.consumption.selectedYears;
            if (yearCheckbox.checked) selected.push(year);
            else this.state.consumption.selectedYears = selected.filter(value => value !== year);
            if (!this.state.consumption.selectedYears.length) {
                this.state.consumption.selectedYears = [year];
            }
            this.openDropdown = 'compare-years';
            this.render('api');
            return;
        }

        if (event.target.matches('#compact-tables')) {
            this.state.settings.compactTables = event.target.checked;
            document.body.classList.toggle('compact-tables', event.target.checked);
        }
    },

    async render(page) {
        const container = document.getElementById('page-container');
        container.innerHTML = '<div class="flex items-center justify-center h-full"><span class="text-on-surface-variant">Loading...</span></div>';

        if (page !== 'settings') {
            if (this.apiConnected) await this.loadLivePageData(page);
            if (!this.liveData[page]) {
                this.currentDataMode = 'unavailable';
                this.updateAPIStatus();
                container.innerHTML = this.createDataUnavailablePage();
                return;
            }
        }

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
        setTimeout(() => {
            this.initCharts(page);
            this.initDatePickers();
        }, 50);
        if (page === 'settings'
            && !this.state.settings.schedule
            && !this.state.settings.scheduleLoading
            && !this.state.settings.scheduleAttempted) {
            this.loadSchedule();
        }
    },

    async loadLivePageData(page) {
        const successful = response => response?.success ? response.data : null;
        let data = null;
        const statePage = page === 'api' ? 'consumption'
            : page === 'department' ? 'analytics'
                : page;
        const query = this.buildApiQuery(statePage);

        if (!this.liveHierarchy) {
            const hierarchy = await API.getHierarchyData();
            this.liveHierarchy = successful(hierarchy);
        }

        if (page === 'dashboard') {
            const [metrics, monthly, topics] = await Promise.all([
                API.getDashboardMetrics(query),
                API.getMonthlyUsage(query),
                API.getTrendingTopics(query),
            ]);
            if (metrics && monthly && topics) {
                this.applyLiveDataAsOf('dashboard', metrics.dataAsOf);
                data = {
                    metrics: successful(metrics),
                    monthly: successful(monthly),
                    topics: successful(topics),
                };
            }
        }

        if (page === 'api') {
            const family = this.state.consumption.drilldownApp;
            const [providers, models, hierarchy, costs, monthly] = await Promise.all([
                API.getProviderConsumption(query),
                API.getModelConsumption(`${query}${query ? '&' : '?'}${family ? `family=${encodeURIComponent(family)}` : ''}`.replace(/[?&]$/, '')),
                API.getHierarchyData(query),
                API.getCosts(query),
                API.getMonthlyUsage(),
            ]);
            if (providers && models && hierarchy && costs && monthly) {
                this.applyLiveDataAsOf('consumption', costs.data?.dataAsOf);
                data = {
                    providers: successful(providers),
                    models: successful(models),
                    hierarchy: successful(hierarchy),
                    hierarchyMeta: hierarchy.meta || {},
                    costs: successful(costs),
                    monthly: successful(monthly),
                };
            }
        }

        if (page === 'department') {
            const [summary, kpis, heatmap] = await Promise.all([
                API.getDepartmentSummary(query),
                API.getDepartmentKPIs(query),
                API.getHeatmapData(query),
            ]);
            if (summary && kpis && heatmap) {
                this.applyLiveDataAsOf('analytics', kpis.data?.dataAsOf);
                data = {
                    departments: successful(summary),
                    departmentMeta: summary.meta || {},
                    kpis: successful(kpis),
                    heatmap: successful(heatmap),
                };
            }
        }

        if (page === 'behavior') {
            const [dailyUsers, tags, apps, kpi] = await Promise.all([
                API.getDailyUsers(query),
                API.getTrendingTags(query),
                API.getAppDistribution(query),
                API.getBehaviorKPI(query),
            ]);
            if (dailyUsers && tags && apps && kpi) {
                this.applyLiveDataAsOf('behavior', kpi.data?.dataAsOf);
                data = {
                    dailyUsers: successful(dailyUsers),
                    tags: successful(tags),
                    apps: successful(apps),
                    kpi: successful(kpi),
                };
            }
        }

        this.liveData[page] = data;
        this.currentDataMode = data ? 'live' : 'unavailable';
        this.updateAPIStatus();
    },

    buildApiQuery(page) {
        const filter = this.state[page]?.filter;
        if (!filter) return '';
        const params = new URLSearchParams();
        const date = filter.date;
        let start;
        let end;
        if (date.mode === 'custom' && date.range.length === 2) {
            [start, end] = date.range;
        } else if (date.mode === 'year') {
            start = `${date.year}-01-01`;
            end = `${date.year}-12-31`;
        } else {
            const lastDay = new Date(date.year, date.month, 0).getDate();
            start = `${date.year}-${String(date.month).padStart(2, '0')}-01`;
            end = `${date.year}-${String(date.month).padStart(2, '0')}-${lastDay}`;
        }
        params.set('start', start);
        params.set('end', end);
        const hierarchy = filter.hierarchy;
        if (hierarchy.campuses.length) params.set('campuses', hierarchy.campuses.join(','));
        if (hierarchy.faculties.length) params.set('faculties', hierarchy.faculties.join(','));
        if (hierarchy.departments.length) params.set('departments', hierarchy.departments.join(','));
        return `?${params.toString()}`;
    },

    applyLiveDataAsOf(page, value) {
        if (!value || this.state[page].liveDateInitialized) return;
        const dataAsOf = new Date(value);
        if (Number.isNaN(dataAsOf.getTime())) return;
        this.state[page].filter.date.month = dataAsOf.getMonth() + 1;
        this.state[page].filter.date.year = dataAsOf.getFullYear();
        this.state[page].liveDateInitialized = true;
    },

    createDataUnavailablePage() {
        return `
            <div class="min-h-[420px] flex items-center justify-center">
                <div class="max-w-md text-center">
                    <span class="material-symbols-outlined text-error text-[40px]">database_off</span>
                    <h2 class="font-headline-lg text-headline-lg text-on-surface mt-md">Database unavailable</h2>
                    <p class="font-body-md text-body-md text-on-surface-variant mt-sm">
                        This page only displays live dashboard data. Start the backend and refresh the page.
                    </p>
                    <button type="button" class="mt-lg px-lg py-sm rounded bg-primary text-on-primary font-label-md" onclick="window.location.reload()">
                        Retry
                    </button>
                </div>
            </div>
        `;
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

    createPageHeader(title, subtitle, controls = '') {
        return `
            <div class="page-header mb-gutter">
                <div class="page-header-copy">
                    <h2 class="font-headline-lg text-headline-lg text-on-surface mb-xs">${title}</h2>
                    <p class="font-body-md text-body-md text-on-surface-variant">${subtitle}</p>
                </div>
                ${controls ? `<div class="page-header-controls">${controls}</div>` : ''}
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

    resetPage(page) {
        if (page === 'analytics') this.state.analytics.page = 1;
        if (page === 'consumption') this.state.consumption.hierarchyPage = 1;
    },

    getHierarchyOptions(page) {
        const hierarchy = this.state[page].filter.hierarchy;
        const rows = this.liveHierarchy || [];
        const campuses = [...new Set(rows.map(row => row.campus).filter(Boolean))];
        const faculties = [...new Set(rows
            .filter(row => !hierarchy.campuses.length || hierarchy.campuses.includes(row.campus))
            .map(row => row.faculty).filter(Boolean))];
        const departments = [...new Set(rows
            .filter(row => (!hierarchy.campuses.length || hierarchy.campuses.includes(row.campus))
                && (!hierarchy.faculties.length || hierarchy.faculties.includes(row.faculty)))
            .map(row => row.department).filter(Boolean))];
        return { campuses, faculties, departments };
    },

    pruneHierarchy(page, changedLevel) {
        const hierarchy = this.state[page].filter.hierarchy;
        const options = this.getHierarchyOptions(page);
        if (changedLevel === 'campuses') {
            hierarchy.faculties = hierarchy.faculties.filter(value => options.faculties.includes(value));
        }
        const refreshed = this.getHierarchyOptions(page);
        if (changedLevel === 'campuses' || changedLevel === 'faculties') {
            hierarchy.departments = hierarchy.departments.filter(value => refreshed.departments.includes(value));
        }
    },

    getHierarchySummary(page) {
        const hierarchy = this.state[page].filter.hierarchy;
        const selected = [
            ...hierarchy.campuses,
            ...hierarchy.faculties,
            ...hierarchy.departments,
        ];
        if (!selected.length) return 'All hierarchy';
        if (selected.length === 1) return selected[0];
        return `${selected.length} hierarchy selections`;
    },

    createHierarchyDropdown(page) {
        const hierarchy = this.state[page].filter.hierarchy;
        const options = this.getHierarchyOptions(page);
        const dropdownId = `hierarchy-${page}`;
        const section = (title, level, values) => `
            <section>
                <div class="font-label-md text-label-md text-on-surface mb-sm">${title}</div>
                <div class="check-list">
                    ${values.length ? values.map(value => `
                        <label class="check-option">
                            <input type="checkbox"
                                data-filter-page="${page}"
                                data-hierarchy-level="${level}"
                                data-filter-value="${value}"
                                ${hierarchy[level].includes(value) ? 'checked' : ''}>
                            <span>${value}</span>
                        </label>
                    `).join('') : '<span class="text-on-surface-variant text-body-md">Select parent level first</span>'}
                </div>
            </section>
        `;

        return `
            <div class="filter-dropdown">
                <span class="control-label">Hierarchy</span>
                <button type="button" class="filter-trigger mt-xs" data-dropdown-toggle="${dropdownId}" aria-expanded="${this.openDropdown === dropdownId}">
                    <span class="material-symbols-outlined text-[18px]">account_tree</span>
                    <span class="filter-summary">${this.getHierarchySummary(page)}</span>
                    <span class="material-symbols-outlined text-[18px]">expand_more</span>
                </button>
                <div id="${dropdownId}" class="filter-popover" ${this.openDropdown === dropdownId ? '' : 'hidden'}>
                    <div class="flex justify-between items-center mb-md">
                        <div>
                            <div class="font-title-lg text-title-lg">Filter by hierarchy</div>
                            <div class="text-body-md text-on-surface-variant">Campus, faculty, then department</div>
                        </div>
                        <button type="button" class="text-primary font-label-md" data-clear-hierarchy="${page}">Clear all</button>
                    </div>
                    <div class="hierarchy-columns">
                        ${section('Campus', 'campuses', options.campuses)}
                        ${section('Faculty / Division', 'faculties', options.faculties)}
                        ${section('Department / Unit', 'departments', options.departments)}
                    </div>
                </div>
            </div>
        `;
    },

    createDateFilter(page) {
        const date = this.state[page].filter.date;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const years = [2022, 2023, 2024, 2025, 2026];
        const customValue = date.mode === 'custom' && date.range.length === 2
            ? `${date.range[0]} to ${date.range[1]}`
            : '';

        return `
            <div class="date-filter">
                <label class="control-label">Period
                    <select class="filter-select compact-select" data-filter-page="${page}" data-date-field="mode">
                        <option value="month" ${date.mode === 'month' ? 'selected' : ''}>Month</option>
                        <option value="year" ${date.mode === 'year' ? 'selected' : ''}>Year</option>
                    </select>
                </label>
                ${date.mode !== 'year' ? `
                    <label class="control-label">Month
                        <select class="filter-select compact-select" data-filter-page="${page}" data-date-field="month">
                            ${months.map((month, index) => `<option value="${index + 1}" ${date.month === index + 1 ? 'selected' : ''}>${month}</option>`).join('')}
                        </select>
                    </label>
                ` : ''}
                <label class="control-label">Year
                    <select class="filter-select compact-select" data-filter-page="${page}" data-date-field="year">
                        ${years.map(year => `<option value="${year}" ${date.year === year ? 'selected' : ''}>${year}</option>`).join('')}
                    </select>
                </label>
                <label class="control-label">Custom range
                    <input type="text" class="filter-select date-range-input" data-date-page="${page}" value="${customValue}" placeholder="Select dates" readonly>
                </label>
            </div>
        `;
    },

    createFilterToolbar(page) {
        return `
            <div class="filter-toolbar">
                ${this.createHierarchyDropdown(page)}
                ${this.createDateFilter(page)}
            </div>
        `;
    },

    initDatePickers() {
        if (typeof flatpickr !== 'function') return;
        document.querySelectorAll('.date-range-input').forEach(input => {
            const page = input.dataset.datePage;
            const date = this.state[page].filter.date;
            flatpickr(input, {
                mode: 'range',
                dateFormat: 'Y-m-d',
                defaultDate: date.range,
                maxDate: 'today',
                onClose: selectedDates => {
                    if (selectedDates.length !== 2) return;
                    const toIso = value => {
                        const year = value.getFullYear();
                        const month = String(value.getMonth() + 1).padStart(2, '0');
                        const day = String(value.getDate()).padStart(2, '0');
                        return `${year}-${month}-${day}`;
                    };
                    date.mode = 'custom';
                    date.range = selectedDates.map(toIso);
                    this.resetPage(page);
                    this.render(this.currentPage);
                },
            });
        });
    },

    getFilterLabel(page) {
        const { date } = this.state[page].filter;
        const hierarchyLabel = this.getHierarchySummary(page);
        const dateLabel = date.mode === 'custom' && date.range.length === 2
            ? `${date.range[0]} to ${date.range[1]}`
            : date.mode === 'year'
                ? `${date.year}`
                : `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.month - 1]} ${date.year}`;
        return `${hierarchyLabel} | ${dateLabel}`;
    },

    createPagination(totalPages, currentPage, target) {
        if (totalPages <= 1) return '';
        const pages = Array.from({ length: totalPages }, (_, index) => index + 1);
        return `
            <div class="flex justify-center items-center gap-sm mt-md text-body-lg">
                <button type="button" class="pagination-btn" data-pagination-target="${target}" data-page-number="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''} title="Previous page">
                    <span class="material-symbols-outlined text-[18px]">chevron_left</span>
                </button>
                ${pages.map(page => `<button type="button" class="pagination-btn ${page === currentPage ? 'active' : ''}" data-pagination-target="${target}" data-page-number="${page}">${page}</button>`).join('')}
                <button type="button" class="pagination-btn" data-pagination-target="${target}" data-page-number="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''} title="Next page">
                    <span class="material-symbols-outlined text-[18px]">chevron_right</span>
                </button>
            </div>
        `;
    },

    createDashboardPage() {
        const live = this.liveData.dashboard;
        const metricMeta = {
            ACTIVE_USERS: ['ACTIVE USERS', 'group'],
            TOKEN_CONSUMPTION: ['TOKEN CONSUMPTION', 'token'],
            COIN_CONSUMPTION: ['COIN CONSUMPTION', 'toll'],
            TOTAL_TRANSACTIONS: ['TOTAL TRANSACTIONS', 'forum'],
        };
        const data = {
            kpis: live.metrics.map(metric => {
                const [label, icon] = metricMeta[metric.metricName] || [metric.metricName, 'analytics'];
                const numeric = Number(metric.value || 0);
                const value = metric.unit === 'Coin'
                    ? `${numeric.toLocaleString(undefined, { maximumFractionDigits: 1 })} Coin`
                    : metric.unit === 'tokens'
                        ? this.formatCompact(numeric)
                        : numeric.toLocaleString();
                const change = metric.changePercent == null
                    ? 'Current filtered period'
                    : `${metric.changePercent >= 0 ? '+' : ''}${metric.changePercent}% vs previous period`;
                return {
                    label,
                    value,
                    change,
                    icon,
                    type: metric.changePercent > 0 ? 'positive' : metric.changePercent < 0 ? 'negative' : 'neutral',
                };
            }),
            monthly: live.monthly.map(item => ({
                month: `${item.month} ${item.year}`,
                usage: Number(item.usage || 0),
            })),
            topics: live.topics,
        };

        return `
            ${this.createPageHeader(
                'Dashboard Overview',
                'System performance and usage metrics from the live dashboard database.',
                this.createFilterToolbar('dashboard')
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

    generateFullHeatmapGrid(data = null) {
        const palettes = {
            forest: ['#dde8dd', '#bad0bd', '#8db394', '#4a8655', '#0d631b'],
            ocean: ['#e1edf6', '#bfd8e9', '#8db9d7', '#4d8dbb', '#0054a7'],
            graphite: ['#e5e7e9', '#c9ced2', '#a5adb4', '#737d85', '#343a40'],
        };
        const colors = palettes[this.state.settings.theme] || palettes.forest;
        const fallbackPattern = [
            1, 1, 2, 1, 0, 0, 0, 0,
            3, 4, 3, 4, 2, 2, 2, 2,
            3, 4, 3, 4, 2, 2, 2, 2,
            2, 2, 1, 2, 0, 0, 0, 0,
            2, 2, 1, 2, 0, 0, 0, 0,
            2, 2, 1, 2, 0, 0, 0, 0,
            2, 2, 1, 2, 0, 0, 0, 0,
        ];
        const values = data ? Array.from({ length: 56 }, () => 0) : null;
        if (values) {
            data.forEach(item => {
                const day = Number(item.day);
                const hourIndex = Math.floor(Number(item.hour) / 3);
                if (day >= 0 && day < 7 && hourIndex >= 0 && hourIndex < 8) {
                    values[(day * 8) + hourIndex] = Number(item.value || 0);
                }
            });
        }
        const max = values ? Math.max(...values, 1) : 1;
        const pattern = values
            ? values.map(value => Math.min(4, Math.floor((value / max) * 4)))
            : fallbackPattern;
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
