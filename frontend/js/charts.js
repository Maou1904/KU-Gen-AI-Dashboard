// Charts Module
const Charts = {
    chartInstances: {},
    palettes: {
        forest: ['#0d631b', '#0054a7', '#7faa85', '#94a89a', '#dce6dc'],
        ocean: ['#0054a7', '#00838f', '#5b8fc9', '#79a8a9', '#dbe9ef'],
        graphite: ['#343a40', '#606970', '#7f8991', '#a3abb1', '#e0e3e5'],
    },

    getThemePalette(count = 5) {
        const theme = document.body.dataset.theme || 'forest';
        const palette = this.palettes[theme] || this.palettes.forest;
        return Array.from({ length: count }, (_, index) => palette[index % palette.length]);
    },

    withAlpha(hex, alpha) {
        const value = hex.replace('#', '');
        const number = Number.parseInt(value, 16);
        const red = (number >> 16) & 255;
        const green = (number >> 8) & 255;
        const blue = number & 255;
        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    },

    centerTextPlugin: {
        id: 'centerText',
        afterDraw(chart, args, options) {
            if (!options?.text) return;
            const { ctx, chartArea } = chart;
            const x = (chartArea.left + chartArea.right) / 2;
            const y = (chartArea.top + chartArea.bottom) / 2;

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = options.color || '#1b1c1c';
            ctx.font = options.font || '700 28px Inter, sans-serif';
            ctx.fillText(options.text, x, y - 12);

            if (options.subtext) {
                ctx.fillStyle = options.subColor || '#40493d';
                ctx.font = options.subFont || '600 13px Inter, sans-serif';
                ctx.fillText(options.subtext, x, y + 22);
            }
            ctx.restore();
        }
    },

    valueLabelsPlugin: {
        id: 'valueLabels',
        afterDatasetsDraw(chart, args, options) {
            if (options === false) return;
            const { ctx } = chart;
            const formatter = options?.formatter || ((value) => {
                if (Math.abs(value) >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
                return value.toLocaleString();
            });

            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = options?.color || '#40493d';
            ctx.font = options?.font || '700 11px Inter, sans-serif';

            chart.data.datasets.forEach((dataset, datasetIndex) => {
                if (!chart.isDatasetVisible(datasetIndex)) return;
                const meta = chart.getDatasetMeta(datasetIndex);
                meta.data.forEach((element, index) => {
                    const raw = dataset.data[index];
                    if (raw === null || raw === undefined) return;
                    const position = element.tooltipPosition();
                    const isLine = dataset.type === 'line' || chart.config.type === 'line';
                    ctx.fillText(formatter(Number(raw)), position.x, position.y - (isLine ? 12 : 4));
                });
            });
            ctx.restore();
        }
    },

    destroy(canvasId) {
        if (this.chartInstances[canvasId]) {
            this.chartInstances[canvasId].destroy();
        }
    },

    formatPercentage(value, fixedDecimals = null) {
        const numeric = Number(value || 0);
        if (!Number.isFinite(numeric)) return '0%';
        if (fixedDecimals !== null) return `${numeric.toFixed(fixedDecimals)}%`;
        if (numeric > 0 && numeric < 0.01) return '<0.01%';
        const decimals = numeric < 1 ? 2 : 1;
        return `${numeric.toFixed(decimals).replace(/\.0$/, '')}%`;
    },

    formatCompactNumber(value) {
        const numeric = Number(value || 0);
        const absolute = Math.abs(numeric);
        if (absolute >= 1000000000000) return `${(numeric / 1000000000000).toFixed(2)}T`;
        if (absolute >= 1000000000) return `${(numeric / 1000000000).toFixed(2)}B`;
        if (absolute >= 1000000) return `${(numeric / 1000000).toFixed(2)}M`;
        if (absolute >= 1000) return `${(numeric / 1000).toFixed(1)}k`;
        return numeric.toLocaleString();
    },

    getDoughnutDisplayData(values, minimumShare = 0) {
        const numericValues = values.map(value => Math.max(0, Number(value || 0)));
        const total = numericValues.reduce((sum, value) => sum + value, 0);
        if (!total || !minimumShare) return numericValues;

        const positiveCount = numericValues.filter(value => value > 0).length;
        if (!positiveCount) return numericValues;

        const safeMinimumShare = Math.min(minimumShare, 0.8 / positiveCount);
        const shares = numericValues.map(value => value / total);
        const smallIndexes = shares
            .map((share, index) => ({ share, index }))
            .filter(item => item.share > 0 && item.share < safeMinimumShare)
            .map(item => item.index);

        if (!smallIndexes.length) return numericValues;

        const smallSet = new Set(smallIndexes);
        const largeShareTotal = shares.reduce((sum, share, index) => (
            smallSet.has(index) ? sum : sum + share
        ), 0);
        const availableLargeShare = Math.max(0, 1 - (smallIndexes.length * safeMinimumShare));

        return shares.map((share, index) => {
            if (!share) return 0;
            if (smallSet.has(index)) return safeMinimumShare * total;
            if (!largeShareTotal) return share * total;
            return (share / largeShareTotal) * availableLargeShare * total;
        });
    },

    createBarChart(canvasId, labels, data, title, highlightIndex) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        this.destroy(canvasId);

        const palette = this.getThemePalette();
        const colors = labels.map((_, index) => (
            index === highlightIndex ? palette[0] : index === 2 ? palette[3] : palette[4]
        ));

        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: title,
                    data,
                    backgroundColor: colors,
                    borderRadius: 4,
                    borderSkipped: false,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 24 } },
                plugins: {
                    legend: { display: false },
                    valueLabels: true,
                    tooltip: { backgroundColor: '#1b1c1c', padding: 12 }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { display: false },
                        ticks: { display: false },
                        border: { display: false }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#707a6c' },
                        border: { display: false }
                    }
                }
            },
            plugins: [this.valueLabelsPlugin]
        });
    },

    createLineChart(canvasId, labels, data, title) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        this.destroy(canvasId);

        const palette = this.getThemePalette();
        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: title,
                    data,
                    borderColor: palette[0],
                    backgroundColor: this.withAlpha(palette[0], 0.12),
                    borderWidth: 5,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: palette[0],
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 28 } },
                plugins: {
                    legend: { display: false },
                    valueLabels: true,
                    tooltip: { backgroundColor: '#1b1c1c', padding: 12 }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#efeded' },
                        ticks: { color: '#707a6c' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#707a6c' }
                    }
                }
            },
            plugins: [this.valueLabelsPlugin]
        });
    },

    createOverviewAreaChart(canvasId, labels, series) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        this.destroy(canvasId);

        const palette = this.getThemePalette(series.length);
        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: series.map((item, index) => ({
                    label: item.label,
                    data: item.data,
                    rawData: item.rawData || item.data,
                    valueLabel: item.valueLabel || '',
                    indexed: item.indexed !== false,
                    borderColor: palette[index],
                    backgroundColor: this.withAlpha(palette[index], 0.14),
                    borderWidth: 3,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    tension: 0.32,
                    fill: true,
                })),
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { top: 24 } },
                plugins: {
                    valueLabels: false,
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: { color: '#1b1c1c', font: { size: 12, weight: '700' }, usePointStyle: true },
                    },
                    tooltip: {
                        backgroundColor: '#1b1c1c',
                        padding: 12,
                        callbacks: {
                            label: context => {
                                const raw = context.dataset.rawData?.[context.dataIndex] ?? context.parsed.y;
                                const suffix = context.dataset.valueLabel ? ` ${context.dataset.valueLabel}` : '';
                                const value = `${context.dataset.label}: ${this.formatCompactNumber(raw)}${suffix}`;
                                return context.dataset.indexed
                                    ? `${value} (${Number(context.parsed.y || 0).toFixed(1)} index)`
                                    : value;
                            },
                        },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#efeded' },
                        ticks: { color: '#707a6c', callback: value => `${value}` },
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#707a6c' },
                    },
                },
            },
        });
    },

    createDualMetricLineChart(canvasId, labels, series) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        this.destroy(canvasId);

        const visibleSeries = series.slice(0, 2);
        const palette = this.getThemePalette(visibleSeries.length);
        const withUnit = (value, unit) => {
            const formatted = this.formatCompactNumber(value);
            return unit ? `${formatted} ${unit}` : formatted;
        };

        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: visibleSeries.map((item, index) => ({
                    label: item.label,
                    data: item.data,
                    rawData: item.rawData || item.data,
                    valueLabel: item.valueLabel || '',
                    yAxisID: index === 0 ? 'y' : 'y1',
                    borderColor: palette[index],
                    backgroundColor: this.withAlpha(palette[index], index === 0 ? 0.12 : 0.05),
                    borderWidth: 3,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    tension: 0.3,
                    fill: index === 0,
                })),
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { top: 24 } },
                plugins: {
                    valueLabels: false,
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: { color: '#1b1c1c', font: { size: 12, weight: '700' }, usePointStyle: true },
                    },
                    tooltip: {
                        backgroundColor: '#1b1c1c',
                        padding: 12,
                        callbacks: {
                            label: context => {
                                const raw = context.dataset.rawData?.[context.dataIndex] ?? context.parsed.y;
                                return `${context.dataset.label}: ${withUnit(raw, context.dataset.valueLabel)}`;
                            },
                        },
                    },
                },
                scales: {
                    y: {
                        type: 'linear',
                        position: 'left',
                        beginAtZero: true,
                        grid: { color: '#efeded' },
                        ticks: { color: '#707a6c', callback: value => this.formatCompactNumber(value) },
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        beginAtZero: true,
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#707a6c', callback: value => this.formatCompactNumber(value) },
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#707a6c' },
                    },
                },
            },
        });
    },

    createDoughnutChart(canvasId, labels, data, colors, centerText = null, subtext = null, onSelect = null, options = {}) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        this.destroy(canvasId);
        options = options || {};

        const rawValues = data.map(value => Math.max(0, Number(value || 0)));
        const displayValues = this.getDoughnutDisplayData(rawValues, Number(options.minVisibleShare || 0));
        const total = rawValues.reduce((sum, value) => sum + value, 0);
        const percentages = (options.percentages || rawValues.map(value => total ? (value / total) * 100 : 0))
            .map(value => Number(value || 0));
        const providedColors = Array.isArray(colors) && colors.every(Boolean) && colors.length === data.length;
        const themedColors = providedColors
            ? colors
            : this.getThemePalette(data.length);
        const valueType = options.valueType || 'percent';
        const percentageDecimals = Number.isInteger(options.percentageDecimals)
            ? options.percentageDecimals
            : null;

        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: displayValues,
                    rawValues,
                    percentages,
                    backgroundColor: themedColors,
                    borderColor: '#fbf9f9',
                    borderWidth: 3,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                onClick: onSelect ? (event, elements) => {
                    if (elements.length) onSelect(elements[0].index);
                } : undefined,
                onHover: onSelect ? (event, elements) => {
                    event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
                } : undefined,
                plugins: {
                    centerText: centerText ? { text: centerText, subtext } : false,
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1b1c1c',
                        padding: 12,
                        callbacks: {
                            label: context => {
                                const rawValue = context.dataset.rawValues?.[context.dataIndex] ?? context.parsed;
                                const percentage = context.dataset.percentages?.[context.dataIndex] ?? rawValue;
                                if (valueType === 'tokens') {
                                    return `${context.label}: ${rawValue.toLocaleString()} Tokens (${this.formatPercentage(percentage, percentageDecimals)})`;
                                }
                                return `${context.label}: ${this.formatPercentage(percentage, percentageDecimals)}`;
                            }
                        }
                    }
                }
            },
            plugins: [this.centerTextPlugin]
        });
    },

    createComboBarLineChart(canvasId, labels, barData, lineData, barLabel, lineLabel) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        this.destroy(canvasId);

        const palette = this.getThemePalette(2);
        this.chartInstances[canvasId] = new Chart(ctx, {
            data: {
                labels,
                datasets: [
                    {
                        type: 'bar',
                        label: barLabel,
                        data: barData,
                        backgroundColor: this.withAlpha(palette[0], 0.72),
                        borderRadius: 4,
                        borderSkipped: false,
                    },
                    {
                        type: 'line',
                        label: lineLabel,
                        data: lineData,
                        borderColor: palette[1],
                        backgroundColor: this.withAlpha(palette[1], 0.12),
                        borderWidth: 4,
                        pointRadius: 4,
                        pointBackgroundColor: palette[1],
                        tension: 0.3,
                        fill: false,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 28 } },
                plugins: {
                    valueLabels: {
                        formatter: value => this.formatCompactNumber(value),
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: { color: '#1b1c1c', font: { size: 12, weight: '700' }, usePointStyle: true },
                    },
                    tooltip: { backgroundColor: '#1b1c1c', padding: 12 },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#efeded' },
                        ticks: { color: '#707a6c', callback: value => this.formatCompactNumber(value) },
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#707a6c' },
                    },
                },
            },
            plugins: [this.valueLabelsPlugin],
        });
    },

    createDualAxisComboChart(canvasId, labels, barData, lineData, barLabel, lineLabel) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        this.destroy(canvasId);

        const palette = this.getThemePalette(2);
        this.chartInstances[canvasId] = new Chart(ctx, {
            data: {
                labels,
                datasets: [
                    {
                        type: 'bar',
                        label: barLabel,
                        data: barData,
                        yAxisID: 'y',
                        backgroundColor: this.withAlpha(palette[0], 0.7),
                        borderRadius: 4,
                        borderSkipped: false,
                    },
                    {
                        type: 'line',
                        label: lineLabel,
                        data: lineData,
                        yAxisID: 'y1',
                        borderColor: palette[1],
                        backgroundColor: this.withAlpha(palette[1], 0.12),
                        borderWidth: 4,
                        pointRadius: 4,
                        pointBackgroundColor: palette[1],
                        tension: 0.32,
                        fill: false,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 28 } },
                plugins: {
                    valueLabels: false,
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: { color: '#1b1c1c', font: { size: 12, weight: '700' }, usePointStyle: true },
                    },
                    tooltip: {
                        backgroundColor: '#1b1c1c',
                        padding: 12,
                        callbacks: {
                            label: context => `${context.dataset.label}: ${this.formatCompactNumber(context.parsed.y)}`,
                        },
                    },
                },
                scales: {
                    y: {
                        type: 'linear',
                        position: 'left',
                        beginAtZero: true,
                        grid: { color: '#efeded' },
                        ticks: { color: '#707a6c', callback: value => this.formatCompactNumber(value) },
                    },
                    y1: {
                        type: 'linear',
                        position: 'right',
                        beginAtZero: true,
                        grid: { drawOnChartArea: false },
                        ticks: { color: '#707a6c', callback: value => this.formatCompactNumber(value) },
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#707a6c' },
                    },
                },
            },
        });
    },

    createMultiLineChart(canvasId, labels, series, options = {}) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        this.destroy(canvasId);

        const palette = this.getThemePalette(series.length);
        const valueLabel = options.valueLabel || 'Tokens';
        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: series.map((item, index) => ({
                    label: item.label,
                    data: item.data,
                    borderColor: palette[index],
                    backgroundColor: this.withAlpha(palette[index], 0.08),
                    borderWidth: 3,
                    pointRadius: 3,
                    pointHoverRadius: 6,
                    tension: 0.28,
                    fill: Boolean(options.fill),
                })),
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 28 } },
                plugins: {
                    valueLabels: false,
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: { color: '#1b1c1c', font: { size: 12, weight: '700' }, usePointStyle: true },
                    },
                    tooltip: {
                        backgroundColor: '#1b1c1c',
                        padding: 12,
                        callbacks: {
                            label: context => `${context.dataset.label}: ${this.formatCompactNumber(context.parsed.y)} ${valueLabel}`,
                        },
                    },
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#efeded' },
                        ticks: { color: '#707a6c', callback: value => this.formatCompactNumber(value) },
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#707a6c' },
                    },
                },
            },
        });
    },

    createHorizontalBarChart(canvasId, labels, data, label, options = {}) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        this.destroy(canvasId);

        const palette = this.getThemePalette(labels.length);
        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label,
                    data,
                    backgroundColor: palette,
                    borderRadius: 4,
                    borderSkipped: false,
                }],
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { right: 24 } },
                plugins: {
                    valueLabels: {
                        formatter: value => options.valueSuffix === '%'
                            ? `${Number(value || 0).toFixed(2)}%`
                            : options.valueSuffix === 's'
                                ? `${Number(value || 0).toFixed(2)}s`
                            : this.formatCompactNumber(value),
                    },
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1b1c1c',
                        padding: 12,
                        callbacks: {
                            label: context => options.valueSuffix === '%'
                                ? `${context.dataset.label}: ${Number(context.parsed.x || 0).toFixed(2)}%`
                                : options.valueSuffix === 's'
                                    ? `${context.dataset.label}: ${Number(context.parsed.x || 0).toFixed(2)}s`
                                : `${context.dataset.label}: ${this.formatCompactNumber(context.parsed.x)}`,
                        },
                    },
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        grid: { color: '#efeded' },
                        ticks: { color: '#707a6c' },
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#707a6c' },
                    },
                },
            },
            plugins: [this.valueLabelsPlugin],
        });
    },

    createGroupedBarChart(canvasId, labels, dataset1, dataset2, label1, label2) {
        const palette = this.getThemePalette(2);
        return this.createMultiBarChart(canvasId, labels, [
            { label: label1, data: dataset1, color: palette[0] },
            { label: label2, data: dataset2, color: palette[1] },
        ]);
    },

    createMultiBarChart(canvasId, labels, series, options = {}) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        this.destroy(canvasId);

        const palette = this.getThemePalette(series.length);
        const valueLabel = options.valueLabel || '';
        const withUnit = value => {
            const formatted = this.formatCompactNumber(value);
            return valueLabel ? `${formatted} ${valueLabel}` : formatted;
        };
        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: series.map((item, index) => ({
                    label: item.year || item.label,
                    data: item.values || item.data,
                    backgroundColor: palette[index],
                    borderRadius: 4,
                    borderSkipped: false,
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 28 } },
                plugins: {
                    valueLabels: {
                        formatter: value => withUnit(value),
                    },
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            color: '#1b1c1c',
                            font: { size: 12, weight: '700' },
                            padding: 16,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1b1c1c',
                        padding: 12,
                        callbacks: {
                            label: context => `${context.dataset.label}: ${withUnit(context.parsed.y)}`,
                        },
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: '#efeded' },
                        ticks: { color: '#707a6c', callback: value => this.formatCompactNumber(value) }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#707a6c' }
                    }
                }
            },
            plugins: [this.valueLabelsPlugin]
        });
    }
};
