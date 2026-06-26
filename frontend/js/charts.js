// Charts Module
const Charts = {
    chartInstances: {},

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

    createBarChart(canvasId, labels, data, title, highlightIndex) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        this.destroy(canvasId);

        const colors = labels.map((_, i) => i === highlightIndex ? '#3b8549' : i === 2 ? '#e0e8e0' : '#e8e6e6');

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

        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: title,
                    data,
                    borderColor: '#0d631b',
                    backgroundColor: 'rgba(13, 99, 27, 0.1)',
                    borderWidth: 5,
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#0d631b',
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

    createDoughnutChart(canvasId, labels, data, colors, centerText = null, subtext = null) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        this.destroy(canvasId);

        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data,
                    backgroundColor: colors,
                    borderColor: '#fbf9f9',
                    borderWidth: 3,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    centerText: centerText ? { text: centerText, subtext } : false,
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1b1c1c',
                        padding: 12,
                        callbacks: {
                            label: context => `${context.label}: ${context.parsed}%`
                        }
                    }
                }
            },
            plugins: [this.centerTextPlugin]
        });
    },

    createGroupedBarChart(canvasId, labels, dataset1, dataset2, label1, label2) {
        return this.createMultiBarChart(canvasId, labels, [
            { label: label1, data: dataset1, color: '#0d631b' },
            { label: label2, data: dataset2, color: '#0054a7' },
        ]);
    },

    createMultiBarChart(canvasId, labels, series) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        this.destroy(canvasId);

        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: series.map(item => ({
                    label: item.year || item.label,
                    data: item.values || item.data,
                    backgroundColor: item.color,
                    borderRadius: 4,
                    borderSkipped: false,
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 28 } },
                plugins: {
                    valueLabels: true,
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
    }
};
