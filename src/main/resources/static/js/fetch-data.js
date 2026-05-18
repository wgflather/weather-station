import { renderWeatherChart } from './weather-chart.js';
import { FetchScheduler } from './FetchScheduler.js';

const state = {
    metrics: null,
    systemHealth: null,
    currentMetric: 'temperature',

    charts: {
        temperature: null, // initially null
        pressure: null
    }
};

const scheduler = new FetchScheduler(
    async (metric, existingChart) => {
        let url = `/api/weather/chart?metric=${metric}`;

        if (existingChart && existingChart.length > 0) {
            const lastBucket = existingChart[existingChart.length - 1].hour;
            url += `&since=${encodeURIComponent(lastBucket)}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Chart fetch failed for ${metric}`);
        }

        return await response.json();
    },

    (newChartPoints, metric) => {
        // Enforce fallback initialization: Convert null to empty array if needed
        if (!state.charts[metric]) {
            state.charts[metric] = [];
        }

        // Safe Merge Logic (Retains historical incremental items)
        if (state.charts[metric].length === 0) {
            state.charts[metric] = newChartPoints;
        } else {
            const existingHours = new Set(state.charts[metric].map(point => point.hour));
            const uniqueDeltas = newChartPoints.filter(point => !existingHours.has(point.hour));
            
            state.charts[metric] = [...state.charts[metric], ...uniqueDeltas];
        }

        // Only flash update the canvas if this metric is currently being looked at
        if (metric === state.currentMetric) {
            renderWeatherChart(state.charts[metric], metric);
        }
    },

    20000 
);

function startChart(metric) {
    // Dynamic runtime callback closure ensures scheduler consistently reads current array length
    scheduler.start(metric, (m) => state.charts[m]);
}

// ==========================================
// DASHBOARD & EVENT INITIALIZATION
// ==========================================

async function fetchDashboard() {
    const response = await fetch(`/api/weather/dashboard`);
    if (!response.ok) throw new Error("Dashboard fetch failed");
    return await response.json();
}

// ==========================================
// TREND RENDERING HELPERS
// ==========================================

function updateTemperatureTrend(direction, changeValue) {
    const el = document.getElementById('temp-trend');
    if (!el) return;
    el.className = '';

    if (direction === 'UP') {
        el.classList.add('trend-up');
        el.innerHTML = `
            <span class="trend-arrow">↑</span>
            <span class="trend-val">${Math.abs(changeValue).toFixed(1)}</span>
        `;
    } else if (direction === 'DOWN') {
        el.classList.add('trend-down');
        el.innerHTML = `
            <span class="trend-arrow">↓</span>
            <span class="trend-val">${Math.abs(changeValue).toFixed(1)}</span>
        `;
    } else {
        el.classList.add('trend-stable');
        el.innerHTML = `<span class="trend-arrow">→</span>`;
    }
}

function updatePressureTrend(direction, changeValue) {
    const el = document.getElementById('pressure-trend');
    if (!el) return;
    el.className = '';

    if (direction === 'UP') {
        el.classList.add('pressure-trend-up');
        el.innerHTML = `
            <span class="trend-arrow">↑</span>
            <span class="trend-val">${Math.abs(changeValue).toFixed(1)}</span>
        `;
    } else if (direction === 'DOWN') {
        el.classList.add('pressure-trend-down');
        el.innerHTML = `
            <span class="trend-arrow">↓</span>
            <span class="trend-val">${Math.abs(changeValue).toFixed(1)}</span>
        `;
    } else {
        el.classList.add('pressure-trend-stable');
        el.innerHTML = `<span class="trend-arrow">→</span>`;
    }
}

function renderMetrics(weather) {
    document.getElementById("avg-temp").textContent = weather?.temperature?.avgTemp ?? "--";
    document.getElementById("min-temp").textContent = weather?.temperature?.min ?? "--";
    document.getElementById("max-temp").textContent = weather?.temperature?.max ?? "--";
    document.getElementById("avg-pressure").textContent = weather?.pressure?.avgPressure ?? "--";

    updateTemperatureTrend(weather?.temperatureTrend?.direction, weather?.temperatureTrend?.changeValue);
    updatePressureTrend(weather?.pressureTrend?.direction, weather?.pressureTrend?.changeValue);
}

function renderSystemHealth(systemHealth) {
    document.getElementById("status").textContent = systemHealth.status;
    document.getElementById("lag").textContent = systemHealth.lagMinutes + ' min';
    document.getElementById("todayRecords").textContent = systemHealth.recordsToday;

    const lastUpdate = document.getElementById("lastUpdate");
    lastUpdate.textContent = systemHealth.lastMeasuredAt
        ? new Date(systemHealth.lastMeasuredAt).toLocaleTimeString('en-GB')
        : "--:--:--";

    const colors = { LIVE: 'green', DELAYED: 'yellow', STALE: 'orange', OFFLINE: 'red' };
    document.getElementById("status").style.color = colors[systemHealth.status] || 'black';
}

async function updateDashboard() {
    try {
        const data = await fetchDashboard();
        state.metrics = data.metricsDashboardDto;
        state.systemHealth = data.systemHealthDashboardDto;

        renderMetrics(state.metrics);
        renderSystemHealth(state.systemHealth);
    } catch (error) {
        console.error(error);
    }
}

function initEventListeners() {
    const selector = document.getElementById('metric-selector');
    if (!selector) return;

    // 1. Establish the baseline default metric from the HTML select element
    state.currentMetric = selector.value;

    // 2. Only start the default metric immediately on boot
    startChart(state.currentMetric);

    selector.addEventListener('change', (event) => {
        const selectedMetric = event.target.value;
        state.currentMetric = selectedMetric;

        const activeData = state.charts[selectedMetric];
        
        // 3. Lazy-loading conditional boundary
        if (activeData === null) {
            // This metric has never been loaded. Fetch it fully right now
            // and activate its standalone background scheduling loop automatically.
            renderWeatherChart([], selectedMetric); // Show a clean canvas loading state
            startChart(selectedMetric);
        } else {
            // Data exists! Instantly swap the UI canvas with our cache data.
            // No network calls made, background scheduler keeps handling updates.
            renderWeatherChart(activeData, selectedMetric);
        }
    });
}

function startPolling(fn, interval) {
    let stopped = false;
    async function loop() {
        if (stopped) return;
        await fn();
        setTimeout(loop, interval);
    }
    loop();
    return () => stopped = true;
}


// Kickstart system
initEventListeners();
startPolling(updateDashboard, 30000);