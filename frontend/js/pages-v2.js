// Page renderers for the interactive hierarchy/date filters and settings workspace.
Object.assign(App, {
    createConsumptionPage() {
        const state = this.state.consumption;
        const live = this.liveData.api;
        const costs = {
            current: Number(live.costs.currentBillingCycle || 0),
            projected: Number(live.costs.projectedEndOfMonth || 0),
            change: Number(live.costs.usageChange || 0),
            changePercent: live.costs.changePercent,
            previous: Number(live.costs.previousBillingCycle || 0),
            isProjected: Boolean(live.costs.isProjected),
        };
        const projectionProgress = costs.projected > 0
            ? Math.min(100, Math.max(0, (costs.current / costs.projected) * 100))
            : 0;
        const allRows = live.hierarchy.map(row => ({
            ...row,
            tokensUsed: Number(row.tokensUsed || 0),
            coinConsumption: Number(row.coinConsumption || 0),
        }));
        const totalPages = Math.max(1, Math.ceil(allRows.length / state.hierarchyPageSize));
        if (state.hierarchyPage > totalPages) state.hierarchyPage = totalPages;
        const start = (state.hierarchyPage - 1) * state.hierarchyPageSize;
        const rows = allRows.slice(start, start + state.hierarchyPageSize);
        const activeFamily = state.drilldownApp;
        const apps = (activeFamily ? live.models : live.providers).slice(0, 8).map((item, index) => ({
            id: activeFamily ? `model-${index}` : item.family,
            modelName: item.modelName || item.family,
            appName: item.modelName || item.family,
            tokens: Number(item.tokens || 0),
            percentage: Number(item.percentage || 0),
        }));
        const activeApp = activeFamily ? { appName: activeFamily } : null;
        const chartItems = apps;
        const chartColors = Charts.getThemePalette(chartItems.length);
        const availableYears = [...new Set(live.monthly.map(item => String(item.year)))].sort();

        return `
            ${this.createPageHeader(
                'Consumption',
                'Monitor token and Coin consumption across apps, models, and campus hierarchies.',
                this.createFilterToolbar('consumption')
            )}

            <div class="bento-grid mb-gutter">
                <section class="col-span-8 glass-panel rounded-lg p-lg min-h-[520px]">
                    <div class="flex justify-between items-start gap-md mb-md">
                        <div>
                            ${activeApp ? `
                                <button type="button" class="inline-flex items-center gap-xs text-primary font-label-md mb-sm" data-app-back>
                                    <span class="material-symbols-outlined text-[18px]">arrow_back</span> Back to apps
                                </button>
                            ` : ''}
                            <h3 class="font-title-lg text-title-lg text-on-surface">
                                ${activeApp ? `${activeApp.appName} · Model usage` : 'App Token Consumption'}
                            </h3>
                            <p class="font-label-md text-label-md text-on-surface-variant mt-xs">
                                ${activeApp ? 'Token distribution by model within this app.' : live ? 'Runtime model usage from the dashboard database.' : 'Select an app to inspect model-level usage.'}
                            </p>
                        </div>
                        <span class="tag-pill px-sm py-xs text-label-md">${this.getFilterLabel('consumption')}</span>
                    </div>
                    <div class="grid grid-cols-[minmax(0,1fr)_220px] gap-lg items-center consumption-chart-layout">
                        <div class="chart-container-lg">
                            <canvas id="modelChart"></canvas>
                        </div>
                        <div class="space-y-xs">
                            ${chartItems.map((item, index) => `
                                <button type="button" class="legend-button" ${activeApp ? '' : `data-app-drilldown="${item.id}"`}>
                                    <span class="w-3 h-3 rounded-full" style="background-color:${chartColors[index]}"></span>
                                    <span>
                                        <span class="block font-label-md text-label-md text-on-surface">${item.appName || item.modelName}</span>
                                        <span class="block font-body-md text-body-md text-on-surface-variant">${Number(item.tokens ?? item.tokenValue ?? 0).toLocaleString()} Tokens</span>
                                    </span>
                                    ${activeApp ? '' : '<span class="material-symbols-outlined text-[18px] text-on-surface-variant">chevron_right</span>'}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                </section>

                <div class="col-span-4 grid grid-rows-2 gap-gutter min-h-[520px] consumption-metrics">
                    <section class="glass-panel rounded-lg p-lg h-full flex flex-col justify-between">
                        <div>
                            <h3 class="font-title-lg text-title-lg text-primary mb-lg flex items-center gap-sm">
                                <span class="material-symbols-outlined">toll</span> Coin Consumption
                            </h3>
                            <p class="font-label-md text-label-md text-on-surface-variant mb-md">${this.getFilterLabel('consumption')}</p>
                            <div class="font-display-lg text-display-lg text-on-surface">
                                ${costs.current.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                                <span class="text-headline-md">Coin</span>
                            </div>
                        </div>
                        <div class="pt-md border-t border-outline-variant flex justify-between items-center gap-sm">
                            <span class="font-label-md text-label-md text-tertiary">${costs.isProjected ? 'Projected month total' : 'Selected period total'}</span>
                            <span class="font-title-lg text-title-lg text-on-surface text-right">${costs.isProjected ? '~' : ''}${costs.projected.toLocaleString(undefined, { maximumFractionDigits: 0 })} Coin</span>
                        </div>
                    </section>

                    <section class="rounded-lg p-lg bg-secondary-container border border-outline-variant h-full flex flex-col justify-between">
                        <div>
                            <p class="font-label-md text-label-md text-on-surface-variant mb-md">Usage Change</p>
                            <div class="font-headline-lg text-headline-lg text-primary">
                                ${costs.change > 0 ? '+' : ''}${costs.change.toLocaleString(undefined, { maximumFractionDigits: 0 })} Coin
                            </div>
                            <span class="font-body-lg text-body-lg text-on-surface-variant">${this.formatComparison(costs.changePercent)}</span>
                        </div>
                        <div>
                            <div class="h-2 bg-surface-container-high rounded-full overflow-hidden mb-sm">
                                <div class="h-full bg-primary rounded-full" style="width:${projectionProgress.toFixed(1)}%"></div>
                            </div>
                            <p class="font-body-md text-body-md text-on-surface-variant">
                                ${costs.previous
                                    ? `Previous period: ${costs.previous.toLocaleString(undefined, { maximumFractionDigits: 0 })} Coin`
                                    : 'No usage was recorded in the previous period.'}
                            </p>
                        </div>
                    </section>
                </div>
            </div>

            <section class="glass-panel rounded-lg p-lg mb-gutter">
                <div class="flex justify-between items-start gap-lg mb-md">
                    <div>
                        <h3 class="font-title-lg text-title-lg text-on-surface">Monthly Tokens Used</h3>
                        <p class="font-label-md text-label-md text-on-surface-variant mt-xs">Compare years available in the current dataset.</p>
                    </div>
                    <div class="filter-dropdown">
                        <span class="control-label">Compare years</span>
                        <button type="button" class="filter-trigger mt-xs" data-dropdown-toggle="compare-years">
                            <span class="material-symbols-outlined text-[18px]">calendar_month</span>
                            <span class="filter-summary">${[...state.selectedYears].sort().join(', ')}</span>
                            <span class="material-symbols-outlined text-[18px]">expand_more</span>
                        </button>
                        <div id="compare-years" class="filter-popover year-popover" ${this.openDropdown === 'compare-years' ? '' : 'hidden'}>
                            <div class="check-list">
                                ${availableYears.map(year => `
                                    <label class="check-option">
                                        <input type="checkbox" data-compare-year="${year}" ${state.selectedYears.includes(year) ? 'checked' : ''}>
                                        <span>${year}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="chart-container">
                    <canvas id="apiMonthlyChart"></canvas>
                </div>
            </section>

            <section class="glass-panel rounded-lg overflow-hidden">
                <div class="flex justify-between items-start p-lg gap-lg">
                    <div>
                        <h3 class="font-title-lg text-title-lg text-on-surface">Usage by Hierarchy</h3>
                        <p class="font-label-md text-label-md text-on-surface-variant mt-xs">${this.getFilterLabel('consumption')}</p>
                        ${Number(live.hierarchyMeta?.unmappedUsage || 0) ? `
                            <p class="font-body-md text-body-md text-error mt-xs">
                                ${Number(live.hierarchyMeta.unmappedUsage).toLocaleString()} usage records are excluded from this breakdown because the source user has no organization data.
                            </p>
                        ` : ''}
                    </div>
                    <span class="font-label-md text-label-md text-on-surface-variant">
                        Showing ${allRows.length ? start + 1 : 0}-${Math.min(start + state.hierarchyPageSize, allRows.length)} of ${allRows.length}
                    </span>
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
                            ${rows.map(row => `
                                <tr>
                                    <td>${row.campus}</td>
                                    <td>${row.faculty}</td>
                                    <td>${row.department}</td>
                                    <td class="text-right">${row.tokensUsed.toLocaleString()}</td>
                                </tr>
                            `).join('') || '<tr><td colspan="4" class="text-center text-on-surface-variant">No usage matches the selected hierarchy.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </section>
            ${this.createPagination(totalPages, state.hierarchyPage, 'consumption')}
        `;
    },

    createAnalyticsPage() {
        const state = this.state.analytics;
        const live = this.liveData.department;
        const departments = live.departments.map(department => ({
            campus: department.campus || 'Unknown',
            name: department.name,
            faculty: department.faculty,
            totalModelsUsed: Number(department.totalTokensUsed || 0),
            coinConsumption: Number(department.coinConsumption || 0),
        }));
        const totalPages = Math.max(1, Math.ceil(departments.length / state.pageSize));
        if (state.page > totalPages) state.page = totalPages;
        const start = (state.page - 1) * state.pageSize;
        const rows = departments.slice(start, start + state.pageSize);
        const coinTotal = Number(live.kpis.coinConsumption || 0);
        const tokenTotal = Number(live.kpis.totalTokens || 0);
        const activeUsers = Number(live.kpis.activeUsers || 0);
        const changes = live.kpis.changes || {};

        return `
            ${this.createPageHeader(
                'Analytics',
                'Compare token and Coin consumption across the university hierarchy.',
                `
                    <div class="page-header-actions">
                        ${this.createFilterToolbar('analytics')}
                        <button id="export-analytics" type="button" class="flex items-center gap-sm px-md py-sm rounded bg-secondary-container text-primary font-label-md text-label-md shrink-0">
                            <span class="material-symbols-outlined text-[18px]">download</span> Export XLSX
                        </button>
                    </div>
                `
            )}

            <div class="bento-grid mb-gutter">
                <div class="col-span-5 grid grid-cols-2 gap-gutter">
                    ${this.createKPICard('Total Tokens', this.formatCompact(tokenTotal), this.formatComparison(changes.totalTokens), 'token', this.comparisonType(changes.totalTokens))}
                    ${this.createKPICard('Active Users', activeUsers.toLocaleString(), this.formatComparison(changes.activeUsers), 'group', this.comparisonType(changes.activeUsers))}
                    <section class="col-span-2 rounded-lg p-lg min-h-[190px] border relative overflow-hidden theme-accent-panel">
                        <span class="material-symbols-outlined absolute right-6 top-1/2 -translate-y-1/2 text-[120px] leading-none text-primary/10">toll</span>
                        <div class="relative">
                            <div class="flex justify-between items-start gap-sm mb-lg">
                                <h3 class="font-title-lg text-title-lg text-on-surface">Coin Consumption</h3>
                                <span class="tag-pill px-sm py-xs text-label-md">${this.getFilterLabel('analytics')}</span>
                            </div>
                            <div class="font-display-lg text-display-lg theme-accent-value">
                                ${coinTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                <span class="text-headline-md">Coin</span>
                            </div>
                            <p class="font-label-md text-label-md text-on-surface-variant mt-sm">${this.formatComparison(changes.coinConsumption)}</p>
                        </div>
                    </section>
                </div>

                <section class="col-span-7 glass-panel rounded-lg p-lg flex flex-col">
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
                            <div id="heatmap-grid" class="grid gap-1 h-full" style="grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(7,1fr)">
                                ${this.generateFullHeatmapGrid(live?.heatmap)}
                            </div>
                        </div>
                    </div>
                    <div class="mt-md grid grid-cols-[auto_1fr_auto] gap-sm items-center text-xs">
                        <span class="font-label-md text-label-md text-on-surface-variant">Low</span>
                        <div class="h-2 rounded-full heatmap-legend"></div>
                        <span class="font-label-md text-label-md text-on-surface-variant">High</span>
                    </div>
                </section>
            </div>

            <section class="glass-panel rounded-lg overflow-hidden">
                <div class="flex justify-between items-center p-lg gap-md">
                    <div>
                        <h3 class="font-title-lg text-title-lg text-on-surface">Department Summary</h3>
                        <p class="font-label-md text-label-md text-on-surface-variant mt-xs">${this.getFilterLabel('analytics')}</p>
                        ${Number(live.departmentMeta?.unmappedUsage || 0) ? `
                            <p class="font-body-md text-body-md text-error mt-xs">
                                ${Number(live.departmentMeta.unmappedUsage).toLocaleString()} usage records have no department in the source and are included in KPI totals only.
                            </p>
                        ` : ''}
                    </div>
                    <span class="font-label-md text-label-md text-on-surface-variant">
                        Showing ${departments.length ? start + 1 : 0}-${Math.min(start + state.pageSize, departments.length)} of ${departments.length}
                    </span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-body-md data-table">
                        <thead>
                            <tr>
                                <th class="text-left">Campus</th>
                                <th class="text-left">Department</th>
                                <th class="text-left">Faculty/Division</th>
                                <th class="text-right">Total Tokens Used</th>
                                <th class="text-right">Coin Consumption</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows.map(dept => `
                                <tr>
                                    <td>${dept.campus}</td>
                                    <td class="font-semibold">${dept.name}</td>
                                    <td>${dept.faculty}</td>
                                    <td class="text-right">${dept.totalModelsUsed.toLocaleString()}</td>
                                    <td class="text-right">${dept.coinConsumption.toLocaleString()} Coin</td>
                                </tr>
                            `).join('') || '<tr><td colspan="5" class="text-center text-on-surface-variant">No departments match the selected filters.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </section>
            ${this.createPagination(totalPages, state.page, 'analytics')}
        `;
    },

    createBehaviorPage() {
        const live = this.liveData.behavior;
        const data = {
            totalNotes: Number(live.kpi.totalNotesGenerated || 0),
            changePercent: live.kpi.changePercent,
            tags: live.tags,
            activeUsers: live.dailyUsers.map(item => ({
                day: new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
                users: Number(item.users || 0),
            })),
        };
        const appDist = live.apps
            .map(app => ({ ...app, percentage: Number(app.percentage || 0) }));
        const appColors = Charts.getThemePalette(appDist.length);

        return `
            ${this.createPageHeader(
                'User Behavior Insights',
                'Analyze interaction patterns and content generation trends.',
                this.createFilterToolbar('behavior')
            )}

            <div class="bento-grid mb-gutter">
                <section class="col-span-4 glass-panel rounded-lg p-lg min-h-[330px] flex flex-col justify-between">
                    <div class="flex items-start gap-sm">
                        <span class="material-symbols-outlined text-primary">description</span>
                        <h3 class="font-title-lg text-title-lg text-on-surface">
                            Total Notes Generated
                            <span class="block font-body-md text-body-md text-on-surface-variant mt-xs">${this.getFilterLabel('behavior')}</span>
                        </h3>
                    </div>
                    <div>
                        <div class="font-display-lg text-display-lg text-primary mb-sm">${data.totalNotes.toLocaleString()}</div>
                        <div class="font-label-md text-label-md ${this.comparisonType(data.changePercent) === 'negative' ? 'text-error' : 'text-primary'} flex items-center gap-1">
                            <span class="material-symbols-outlined text-[14px]">${this.comparisonType(data.changePercent) === 'positive' ? 'trending_up' : this.comparisonType(data.changePercent) === 'negative' ? 'trending_down' : 'horizontal_rule'}</span>
                            ${this.formatComparison(data.changePercent)}
                        </div>
                    </div>
                </section>

                <section class="col-span-8 glass-panel rounded-lg p-lg">
                    <div class="flex justify-between items-start mb-xl">
                        <h3 class="font-title-lg text-title-lg text-on-surface flex items-center gap-sm">
                            <span class="text-primary">#</span> Popular Conversation Tags
                        </h3>
                        <span class="tag-pill px-sm py-xs text-label-md">Top 10</span>
                    </div>
                    <div id="popular-tags" class="flex flex-wrap gap-md">
                        ${this.createTagPills(data.tags.slice(0, 10), [0, 1, 3, 6, 9])}
                    </div>
                </section>
            </div>

            <div class="border-t border-outline-variant mb-gutter"></div>

            <div class="bento-grid">
                <section class="col-span-8 glass-panel rounded-lg p-lg">
                    <div class="flex justify-between items-center mb-md">
                        <h3 class="font-title-lg text-title-lg text-on-surface flex items-center gap-sm">
                            <span class="material-symbols-outlined text-primary">groups</span> Active Users
                        </h3>
                        <span class="font-label-md text-label-md text-on-surface-variant">
                            Avg: ${Math.round(data.activeUsers.reduce((sum, item) => sum + item.users, 0) / Math.max(1, data.activeUsers.length)).toLocaleString()}/day
                        </span>
                    </div>
                    <div class="chart-container"><canvas id="dailyChart"></canvas></div>
                </section>
                <section class="col-span-4 glass-panel rounded-lg p-lg">
                    <h3 class="font-title-lg text-title-lg text-on-surface mb-md flex items-center gap-sm">
                        <span class="material-symbols-outlined text-primary">apps</span> Top Active Apps
                    </h3>
                    <div class="chart-container"><canvas id="behaviorAppChart"></canvas></div>
                    <div class="space-y-sm mt-md">
                        ${appDist.map((app, index) => `
                            <div class="flex justify-between items-center">
                                <span class="flex items-center gap-sm">
                                    <span class="w-3 h-3 rounded-full" style="background-color:${appColors[index]}"></span>${app.app}
                                </span>
                                <span class="font-label-md text-label-md text-on-surface-variant">${app.percentage}%</span>
                            </div>
                        `).join('')}
                    </div>
                </section>
            </div>
        `;
    },

    createSettingsPage() {
        const settings = this.state.settings;
        const sync = settings.schedule;
        const schedule = sync?.schedule;
        const counts = sync?.counts || {};
        const connections = sync?.connections || [];
        const syncReady = connections.length === 3 && connections.every(connection =>
            connection.name === 'dashboard'
                ? connection.status === 'connected' && connection.canWrite
                : connection.status === 'connected' && connection.safeReadOnly
        );
        const connectionLabel = {
            dashboard: 'Dashboard',
            kucsgenai: 'KUCSGenAI',
            dify: 'Dify',
        };
        const themes = [
            ['forest', 'Forest', '#0d631b'],
            ['ocean', 'Ocean', '#0054a7'],
            ['graphite', 'Graphite', '#343a40'],
        ];

        return `
            ${this.createPageHeader(
                'Settings',
                'Dashboard preferences and data synchronization controls.'
            )}

            <div class="glass-panel rounded-lg p-lg">
                <section class="settings-band">
                    <div class="grid grid-cols-[260px_minmax(0,1fr)] gap-xl settings-layout">
                        <div>
                            <h3 class="font-title-lg text-title-lg text-on-surface">Appearance</h3>
                            <p class="font-body-md text-body-md text-on-surface-variant mt-xs">Preferences are saved locally in this browser.</p>
                        </div>
                        <div>
                            <div class="font-label-md text-label-md text-on-surface mb-sm">Accent theme</div>
                            <div class="flex gap-md">
                                ${themes.map(([value, label, color]) => `
                                    <button type="button" data-theme-value="${value}" class="grid justify-items-center gap-xs font-label-md text-label-md">
                                        <span class="theme-swatch ${settings.theme === value ? 'active' : ''}" style="background:${color}"></span>
                                        <span>${label}</span>
                                    </button>
                                `).join('')}
                            </div>
                            <label class="mt-lg flex items-center gap-sm font-body-md text-body-md">
                                <input id="compact-tables" type="checkbox" ${settings.compactTables ? 'checked' : ''}>
                                Compact table rows
                            </label>
                        </div>
                    </div>
                </section>

                <section class="settings-band">
                    <div class="flex justify-between items-start gap-lg mb-lg">
                        <div>
                            <h3 class="font-title-lg text-title-lg text-on-surface">Data Schedule</h3>
                            <p class="font-body-md text-body-md text-on-surface-variant mt-xs">Controls the real dashboard database synchronization service.</p>
                        </div>
                        <div class="flex gap-sm">
                            <button id="schedule-refresh" type="button" class="icon-button" title="Refresh schedule">
                                <span class="material-symbols-outlined">refresh</span>
                            </button>
                            <button id="schedule-run" type="button" class="flex items-center gap-sm px-md py-sm rounded bg-secondary-container text-primary font-label-md" ${!syncReady || sync?.running ? 'disabled' : ''}>
                                <span class="material-symbols-outlined text-[18px]">play_arrow</span> Run now
                            </button>
                        </div>
                    </div>

                    ${settings.scheduleLoading ? `
                        <div class="py-xl text-center text-on-surface-variant">Loading schedule...</div>
                    ` : schedule ? `
                        <div class="mb-lg">
                            <div class="flex justify-between items-center gap-md mb-sm">
                                <div>
                                    <h4 class="font-title-md text-title-md text-on-surface">Database connections</h4>
                                    <p class="font-body-md text-body-md text-on-surface-variant mt-xs">
                                        Source databases must pass both permission and session-level read-only checks.
                                    </p>
                                </div>
                                <span class="sync-readiness ${syncReady ? 'ready' : 'blocked'}">
                                    <span class="material-symbols-outlined text-[16px]">${syncReady ? 'verified_user' : 'gpp_bad'}</span>
                                    ${syncReady ? 'Ready to sync' : 'Sync blocked'}
                                </span>
                            </div>
                            <div class="grid grid-cols-3 gap-sm connection-grid">
                                ${connections.map(connection => {
                                    const isDashboard = connection.name === 'dashboard';
                                    const safe = isDashboard
                                        ? connection.status === 'connected' && connection.canWrite
                                        : connection.status === 'connected' && connection.safeReadOnly;
                                    return `
                                        <div class="connection-status ${safe ? 'ready' : 'blocked'}">
                                            <div class="flex justify-between items-start gap-sm">
                                                <div>
                                                    <div class="font-label-md text-label-md text-on-surface">${connectionLabel[connection.name] || connection.name}</div>
                                                    <div class="font-body-md text-body-md text-on-surface-variant mt-xs">${connection.database || 'Unavailable'}</div>
                                                </div>
                                                <span class="material-symbols-outlined text-[18px]">${safe ? 'check_circle' : 'error'}</span>
                                            </div>
                                            <div class="font-label-md text-label-md mt-sm">
                                                ${isDashboard
                                                    ? (connection.canWrite ? 'Dashboard writer' : 'Write permission missing')
                                                    : (connection.safeReadOnly ? 'Source read only' : 'Read-only protection failed')}
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>

                        <div class="grid grid-cols-4 gap-md mb-lg schedule-fields">
                            <label class="control-label">Automatic sync
                                <select id="schedule-enabled" class="filter-select">
                                    <option value="false" ${!schedule.is_enabled ? 'selected' : ''}>Disabled</option>
                                    <option value="true" ${schedule.is_enabled ? 'selected' : ''}>Enabled</option>
                                </select>
                            </label>
                            <label class="control-label">Interval
                                <select id="schedule-interval" class="filter-select">
                                    ${[15, 30, 60, 180, 360, 720, 1440].map(value => `<option value="${value}" ${Number(schedule.interval_minutes) === value ? 'selected' : ''}>${value < 60 ? `${value} min` : `${value / 60} hr`}</option>`).join('')}
                                </select>
                            </label>
                            <label class="control-label">Overlap minutes
                                <input id="schedule-overlap" class="filter-select" type="number" min="0" max="1440" value="${schedule.overlap_minutes}">
                            </label>
                            <label class="control-label">Batch size
                                <input id="schedule-batch" class="filter-select" type="number" min="10" max="10000" value="${schedule.batch_size}">
                            </label>
                        </div>
                        <div class="flex justify-between items-center gap-md mb-lg">
                            <div class="font-body-md text-body-md text-on-surface-variant">
                                ${schedule.is_enabled
                                    ? `Next run: ${schedule.next_run_at ? new Date(schedule.next_run_at).toLocaleString('th-TH') : 'pending'}`
                                    : 'Automatic schedule is currently disabled.'}
                            </div>
                            <button id="schedule-save" type="button" class="flex items-center gap-sm px-lg py-sm rounded bg-primary text-on-primary font-label-md" ${connections.find(connection => connection.name === 'dashboard')?.canWrite ? '' : 'disabled'}>
                                <span class="material-symbols-outlined text-[18px]">save</span> Save schedule
                            </button>
                        </div>

                        <div class="grid grid-cols-5 gap-sm mb-lg schedule-counts">
                            ${[
                                ['Apps', counts.apps],
                                ['Users', counts.users],
                                ['Usage events', counts.usage_events],
                                ['Model events', counts.model_events],
                                ['Notes', counts.notes],
                            ].map(([label, value]) => `
                                <div class="border border-outline-variant rounded p-md">
                                    <div class="font-label-md text-label-md text-on-surface-variant">${label}</div>
                                    <div class="font-headline-md text-headline-md mt-xs">${Number(value || 0).toLocaleString()}</div>
                                </div>
                            `).join('')}
                        </div>

                        <div class="overflow-x-auto">
                            <table class="w-full data-table text-body-md">
                                <thead><tr><th>Run</th><th>Started</th><th>Status</th><th>Rows read</th><th>Error</th></tr></thead>
                                <tbody>
                                    ${(sync.recentRuns || []).slice(0, 6).map(run => `
                                        <tr>
                                            <td>#${run.run_id}</td>
                                            <td>${new Date(run.started_at).toLocaleString('th-TH')}</td>
                                            <td><span class="run-status ${run.status}">${run.status}</span></td>
                                            <td>${Number(run.rows_read).toLocaleString()}</td>
                                            <td>${run.error_message || '-'}</td>
                                        </tr>
                                    `).join('') || '<tr><td colspan="5">No synchronization history yet.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    ` : `
                        <div class="border border-error/30 bg-error-container rounded p-lg text-error">
                            Schedule data is unavailable. Start the backend and use Refresh to try again.
                        </div>
                    `}

                    ${settings.message ? `
                        <div class="mt-md font-body-md ${settings.messageType === 'error' ? 'text-error' : 'text-primary'}">${settings.message}</div>
                    ` : ''}
                </section>
            </div>
        `;
    },

    exportAnalytics() {
        if (typeof XLSX === 'undefined') {
            window.alert('XLSX library is not available.');
            return;
        }
        const sourceRows = this.liveData.department.departments.map(row => ({
            campus: row.campus || 'Unknown',
            faculty: row.faculty,
            name: row.name,
            totalModelsUsed: Number(row.totalTokensUsed || 0),
            coinConsumption: Number(row.coinConsumption || 0),
        }));
        const rows = sourceRows.map(row => ({
            Campus: row.campus,
            'Faculty / Division': row.faculty,
            'Department / Unit': row.name,
            'Total Tokens Used': row.totalModelsUsed,
            'Coin Consumption': row.coinConsumption,
        }));
        const workbook = XLSX.utils.book_new();
        const dataSheet = XLSX.utils.json_to_sheet(rows);
        dataSheet['!cols'] = [{ wch: 20 }, { wch: 38 }, { wch: 30 }, { wch: 20 }, { wch: 20 }];
        const filterSheet = XLSX.utils.aoa_to_sheet([
            ['Dashboard Export', 'Analytics'],
            ['Filter', this.getFilterLabel('analytics')],
            ['Exported at', new Date().toISOString()],
            ['Rows', rows.length],
        ]);
        XLSX.utils.book_append_sheet(workbook, dataSheet, 'Department Summary');
        XLSX.utils.book_append_sheet(workbook, filterSheet, 'Filters');
        XLSX.writeFile(workbook, `KUCSGenAI-Analytics-${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
    },

    async loadSchedule(force = false) {
        const settings = this.state.settings;
        if (settings.scheduleLoading) return;
        settings.scheduleLoading = true;
        settings.scheduleAttempted = true;
        if (force) settings.message = '';
        this.render('settings');
        const response = await API.getSyncStatus();
        settings.schedule = response?.data || null;
        settings.scheduleLoading = false;
        if (!settings.schedule) {
            settings.message = API.lastError || 'Could not load schedule from the backend.';
            settings.messageType = 'error';
        }
        this.render('settings');
    },

    async saveSchedule() {
        const settings = this.state.settings;
        const payload = {
            isEnabled: document.getElementById('schedule-enabled')?.value === 'true',
            intervalMinutes: Number(document.getElementById('schedule-interval')?.value),
            overlapMinutes: Number(document.getElementById('schedule-overlap')?.value),
            batchSize: Number(document.getElementById('schedule-batch')?.value),
        };
        settings.message = 'Saving schedule...';
        settings.messageType = 'neutral';
        this.render('settings');
        const response = await API.updateSyncSchedule(payload);
        if (!response) {
            settings.message = API.lastError || 'Schedule could not be saved.';
            settings.messageType = 'error';
            this.render('settings');
            return;
        }
        settings.message = 'Schedule saved.';
        settings.messageType = 'success';
        settings.schedule = null;
        settings.scheduleAttempted = false;
        await this.loadSchedule();
    },

    async runSyncNow() {
        const settings = this.state.settings;
        settings.message = 'Synchronization is running...';
        settings.messageType = 'neutral';
        this.render('settings');
        const response = await API.runSync();
        settings.message = response?.data?.runId
            ? `Synchronization completed. Run #${response.data.runId}`
            : (API.lastError || 'Synchronization failed.');
        settings.messageType = response?.data?.runId ? 'success' : 'error';
        settings.schedule = null;
        settings.scheduleAttempted = false;
        await this.loadSchedule();
    },

    initCharts(page) {
        if (page === 'dashboard') {
            const live = this.liveData.dashboard;
            const monthlyData = live.monthly.map(item => ({
                month: `${item.month} ${item.year}`,
                usage: Number(item.usage || 0),
            }));
            Charts.createBarChart(
                'monthlyChart',
                monthlyData.map(item => item.month),
                monthlyData.map(item => item.usage),
                'Monthly Usage',
                monthlyData.length - 1
            );
            return;
        }

        if (page === 'api') {
            const state = this.state.consumption;
            const live = this.liveData.api;
            const activeFamily = state.drilldownApp;
            const apps = (activeFamily ? live.models : live.providers).slice(0, 8).map((item, index) => ({
                id: activeFamily ? `model-${index}` : item.family,
                modelName: item.modelName || item.family,
                tokens: Number(item.tokens || 0),
                percentage: Number(item.percentage || 0),
            }));
            const activeApp = activeFamily ? { appName: activeFamily } : null;
            const chartItems = apps;
            const values = chartItems.map(item => item.percentage);
            const total = this.formatCompact(
                chartItems.reduce((sum, item) => sum + Number(item.tokens || 0), 0)
            );
            Charts.createDoughnutChart(
                'modelChart',
                chartItems.map(item => item.appName || item.modelName),
                values,
                chartItems.map(item => item.color),
                total,
                activeApp ? 'Model Tokens' : 'Total Tokens',
                activeApp ? null : index => {
                    this.state.consumption.drilldownApp = chartItems[index].id;
                    this.render('api');
                }
            );
            const tokenData = (() => {
                const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const years = state.selectedYears.filter(year =>
                    live.monthly.some(item => String(item.year) === year)
                );
                return {
                    labels,
                    series: years.map(year => ({
                        label: year,
                        data: labels.map(month => Number(
                            live.monthly.find(item => String(item.year) === year && item.month === month)?.tokens || 0
                        )),
                    })),
                };
            })();
            Charts.createMultiBarChart('apiMonthlyChart', tokenData.labels, tokenData.series);
            return;
        }

        if (page === 'behavior') {
            const live = this.liveData.behavior;
            const behaviorData = {
                activeUsers: live.dailyUsers.map(item => ({
                    day: new Date(item.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
                    users: Number(item.users || 0),
                })),
            };
            Charts.createLineChart(
                'dailyChart',
                behaviorData.activeUsers.map(item => item.day),
                behaviorData.activeUsers.map(item => item.users),
                'Active Users'
            );
            const appData = live.apps
                .map(app => ({ ...app, percentage: Number(app.percentage || 0) }));
            Charts.createDoughnutChart(
                'behaviorAppChart',
                appData.map(item => item.app),
                appData.map(item => item.percentage),
                appData.map(item => item.color),
                String(appData.length),
                'App groups'
            );
        }
    },
});
