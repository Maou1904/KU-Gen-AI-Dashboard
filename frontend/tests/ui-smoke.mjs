import fs from 'node:fs/promises';

const endpoint = await fetch('http://127.0.0.1:9223/json/new?http://localhost:8080/%23/dashboard', {
    method: 'PUT',
}).then(response => response.json());

const socket = new WebSocket(endpoint.webSocketDebuggerUrl);
const pending = new Map();
const errors = [];
let messageId = 0;

await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
});

socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
    }
    if (message.method === 'Runtime.exceptionThrown') {
        errors.push(message.params.exceptionDetails.text);
    }
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++messageId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
});

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const evaluate = async expression => {
    const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
    });
    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    }
    return result.result.value;
};
const navigate = async hash => {
    await send('Page.navigate', { url: `http://localhost:8080/#/${hash}` });
    for (let attempt = 0; attempt < 30; attempt += 1) {
        await wait(100);
        const ready = await evaluate(`Boolean(document.querySelector('main h2'))`);
        if (ready) return;
    }
    const diagnostic = await evaluate(`({
        url: location.href,
        readyState: document.readyState,
        html: document.documentElement?.outerHTML?.slice(0, 500),
        body: document.body?.innerText?.slice(0, 500),
        apiBase: window.API?.BASE_URL,
        appLoaded: typeof App !== 'undefined',
    })`);
    throw new Error(`Page did not finish rendering: ${hash} ${JSON.stringify({ diagnostic, errors })}`);
};
const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setBlockedURLs', {
    urls: [
        'https://cdn.tailwindcss.com/*',
        'https://fonts.googleapis.com/*',
        'https://fonts.gstatic.com/*',
    ],
});
await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
});
await navigate('dashboard');

const dashboardHierarchy = await evaluate(`(() => {
    const trigger = document.querySelector('[data-dropdown-toggle="hierarchy-dashboard"]');
    trigger.click();
    const opened = !document.querySelector('#hierarchy-dashboard').hidden;
    const campusOptions = document.querySelectorAll('[data-filter-page="dashboard"][data-hierarchy-level="campuses"]');
    campusOptions[0].click();
    return { opened, campusOptionCount: campusOptions.length };
})()`);
await wait(500);
const dashboard = await evaluate(`(() => {
    const campusOptions = document.querySelectorAll('[data-filter-page="dashboard"][data-hierarchy-level="campuses"]');
    if (campusOptions.length > 1) campusOptions[1].click();
    const modeSelect = document.querySelector('[data-filter-page="dashboard"][data-date-field="mode"]');
    modeSelect.value = 'year';
    modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    return {
        campuses: App.state.dashboard.filter.hierarchy.campuses,
        mode: App.state.dashboard.filter.date.mode,
        heading: document.querySelector('main h2')?.textContent,
    };
})()`);
assert(dashboardHierarchy.opened, 'Dashboard hierarchy dropdown did not open');
assert(
    dashboard.campuses.length === Math.min(2, dashboardHierarchy.campusOptionCount),
    'Dashboard campus selection did not retain the available values'
);
assert(dashboard.mode === 'year', 'Dashboard year filter did not update state');

await wait(150);
const customRange = await evaluate(`(() => {
    const input = document.querySelector('[data-date-page="dashboard"]');
    const select = document.querySelector('[data-filter-page="dashboard"][data-date-field="year"]');
    const selectedYear = Number(select.value);
    const inputStyle = getComputedStyle(input);
    const selectStyle = getComputedStyle(select);
    const controlStyleMatches = inputStyle.height === selectStyle.height
        && inputStyle.fontSize === selectStyle.fontSize
        && inputStyle.fontWeight === selectStyle.fontWeight
        && inputStyle.borderRadius === selectStyle.borderRadius;
    input.click();
    const pickerOpened = input._flatpickr.isOpen;
    const callback = input._flatpickr.config.onClose[0];
    callback([new Date(selectedYear, 4, 1), new Date(selectedYear, 4, 15)]);
    input._flatpickr.close();
    return {
        ...App.state.dashboard.filter.date,
        pickerOpened,
        controlStyleMatches,
        yearOptions: [...select.options].map(option => option.value),
        availableYears: App.getAvailableYears('dashboard').map(String),
    };
})()`);
assert(customRange.mode === 'custom' && customRange.range.length === 2, 'Custom date range did not update state');
assert(customRange.pickerOpened, 'Flatpickr custom range calendar did not open');
assert(customRange.controlStyleMatches, 'Custom date input does not match the other date controls');
assert(
    JSON.stringify(customRange.yearOptions) === JSON.stringify(customRange.availableYears),
    'Dashboard year filter options do not match the live available years'
);

await navigate('department');
const analytics = await evaluate(`(() => {
    window.__xlsxExport = null;
    XLSX.writeFile = (workbook, filename) => {
        window.__xlsxExport = { filename, sheets: workbook.SheetNames };
    };
    document.querySelector('#export-analytics').click();
    return {
        exportResult: window.__xlsxExport,
        rows: document.querySelectorAll('.data-table tbody tr').length,
        coinText: document.body.innerText.includes('Consumed in the currently selected scope and period'),
    };
})()`);
assert(analytics.exportResult?.filename.endsWith('.xlsx'), 'Analytics export did not create an XLSX file');
assert(analytics.exportResult.sheets.includes('Department Summary'), 'Analytics export is missing the data sheet');
assert(analytics.coinText, 'Analytics Coin scope copy is missing');
await fs.mkdir('frontend/tests/artifacts', { recursive: true });
const analyticsDesktop = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile('frontend/tests/artifacts/analytics-desktop.png', Buffer.from(analyticsDesktop.data, 'base64'));

await navigate('api');
const consumption = await evaluate(`(() => {
    const firstApp = document.querySelector('[data-app-drilldown]');
    firstApp.click();
    const drilldownHeading = document.querySelector('main h3')?.textContent.trim();
    document.querySelector('[data-app-back]').click();
    document.querySelector('[data-dropdown-toggle="compare-years"]').click();
    const compareOptions = [...document.querySelectorAll('[data-compare-year]')];
    const targetYear = compareOptions.find(input => !input.checked) || compareOptions[0];
    targetYear.click();
    const yearsAfterClick = [...App.state.consumption.selectedYears];
    const tokenCells = [...document.querySelectorAll('.data-table tbody td:last-child')]
        .map(element => element.textContent.trim());
    const resetButtonExists = Boolean(document.querySelector('[data-reset-compare-years]'));
    App.resetConsumptionYears();
    const yearsAfterReset = [...App.state.consumption.selectedYears];
    const latestYear = [...new Set(App.liveData.api.monthly.map(item => String(item.year)))].sort().at(-1);
    const next = document.querySelector('[data-pagination-target="consumption"][data-page-number="2"]');
    if (next) next.click();
    return {
        drilldownHeading,
        yearsAfterClick,
        yearsAfterReset,
        latestYear,
        resetButtonExists,
        clickedYear: targetYear.dataset.compareYear,
        compareYearOptions: compareOptions.map(input => input.dataset.compareYear),
        monthlyYears: [...new Set(App.liveData.api.monthly.map(item => String(item.year)))].sort(),
        tokenCells,
        page: App.state.consumption.hierarchyPage,
        hasBack: Boolean(document.querySelector('[data-app-back]')),
        forestChartColor: Charts.chartInstances.modelChart.data.datasets[0].backgroundColor[0],
    };
})()`);
assert(consumption.drilldownHeading.includes('Model usage'), 'App to model drill-down did not render');
assert(consumption.yearsAfterClick.includes(consumption.clickedYear), 'Year comparison multi-select failed');
assert(consumption.yearsAfterClick.length <= 6, 'Year comparison selected more than 6 years');
assert(consumption.resetButtonExists, 'Year comparison reset button is missing');
assert(
    consumption.yearsAfterReset.length === 1 && consumption.yearsAfterReset[0] === consumption.latestYear,
    'Year comparison reset did not return to the latest year only'
);
assert(
    JSON.stringify(consumption.compareYearOptions) === JSON.stringify(consumption.monthlyYears),
    'Consumption compare-year options do not match the live monthly years'
);
assert(
    consumption.tokenCells.every(value => /(^[\d,]+$)|(^\d+\.\d{2}[MBT]$)/.test(value)),
    'Hierarchy token values are not using the expected compact format'
);
assert(consumption.page === 2, 'Consumption hierarchy pagination did not advance');

await evaluate(`(() => {
    App.openDropdown = null;
    App.render('api');
    return true;
})()`);
await wait(200);
await fs.mkdir('frontend/tests/artifacts', { recursive: true });
const consumptionDesktop = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile('frontend/tests/artifacts/consumption-desktop.png', Buffer.from(consumptionDesktop.data, 'base64'));
await evaluate(`(() => {
    document.querySelector('#apiMonthlyChart').scrollIntoView({ block: 'center' });
    return true;
})()`);
await wait(150);
const monthlyDesktop = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile('frontend/tests/artifacts/monthly-years-desktop.png', Buffer.from(monthlyDesktop.data, 'base64'));

await navigate('behavior');
const behavior = await evaluate(`(() => ({
    badge: [...document.querySelectorAll('.tag-pill')].find(element => element.textContent.includes('Top'))?.textContent.trim(),
    tagCount: document.querySelectorAll('#popular-tags .tag-pill').length,
    filterCopy: document.querySelector('main h3 span')?.textContent.trim(),
    appPercentages: [...document.querySelectorAll('.chart-container + .space-y-sm span.font-label-md')]
        .map(element => element.textContent.trim()),
}))()`);
assert(behavior.badge === 'Top 10', 'Behavior tag badge is not Top 10');
assert(behavior.tagCount === 10, 'Behavior page does not render exactly 10 tags');
assert(
    behavior.appPercentages.every(value => /^\d+\.\d{2}%$/.test(value)),
    'Top Active Apps percentages are not rendered with 2 decimals'
);

await navigate('settings');
await wait(1200);
const settings = await evaluate(`(() => {
    document.querySelector('[data-theme-value="ocean"]').click();
    return {
        theme: document.body.dataset.theme,
        schedule: Boolean(document.querySelector('#schedule-interval')),
        runHistory: document.querySelectorAll('.data-table tbody tr').length,
        connectionCards: document.querySelectorAll('.connection-status.ready').length,
        syncReady: document.querySelector('.sync-readiness.ready')?.textContent.includes('Ready to sync'),
        runEnabled: !document.querySelector('#schedule-run')?.disabled,
    };
})()`);
assert(settings.theme === 'ocean', 'Theme selection did not apply');
assert(settings.schedule, 'Schedule controls were not integrated into Settings');
assert(settings.connectionCards === 3, 'All three database connections are not ready');
assert(settings.syncReady && settings.runEnabled, 'Sync controls are not enabled after preflight');

await navigate('department');
const themedAnalytics = await evaluate(`(() => ({
    heatmapHigh: document.querySelector('#heatmap-grid > div:nth-child(10)')?.style.backgroundColor,
    accentColor: getComputedStyle(document.querySelector('.theme-accent-value')).color,
}))()`);
assert(themedAnalytics.heatmapHigh === 'rgb(0, 84, 167)', 'Heatmap did not switch to the Ocean palette');

await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
});
await navigate('api');
const mobile = await evaluate(`(() => ({
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    mainOverflow: document.querySelector('main').scrollWidth > document.querySelector('main').clientWidth,
    width: document.documentElement.clientWidth,
    oceanChartColor: Charts.chartInstances.modelChart.data.datasets[0].backgroundColor[0],
}))()`);
assert(!mobile.overflow && !mobile.mainOverflow, 'Consumption overflows the mobile viewport');
assert(consumption.forestChartColor !== mobile.oceanChartColor, 'Chart palette did not change with the selected theme');
assert(mobile.oceanChartColor === '#0054a7', 'Consumption chart did not use the Ocean primary color');

await evaluate(`(() => {
    App.openDropdown = null;
    App.render('api');
    return true;
})()`);
await wait(200);
const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile('frontend/tests/artifacts/consumption-mobile.png', Buffer.from(screenshot.data, 'base64'));

await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
});
await navigate('settings');
const desktopScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
await fs.writeFile('frontend/tests/artifacts/settings-desktop.png', Buffer.from(desktopScreenshot.data, 'base64'));

assert(errors.length === 0, `Browser runtime errors: ${errors.join('; ')}`);
console.log(JSON.stringify({
    dashboard,
    customRange,
    analytics,
    consumption,
    behavior,
    settings,
    themedAnalytics,
    mobile,
    browserErrors: errors,
}, null, 2));

socket.close();
