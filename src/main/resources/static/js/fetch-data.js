import { renderWeatherChart } from './weather-chart.js';
const state = {
    metrics: null,
    systemHealth: null
}

async function fetchDashboard(){
    const response = await fetch(`/api/weather/dashboard`);

    if(!response.ok){
        console.log(response.status);
        throw new Error("Some network error occurred");
    }

    const dashboardData = await response.json();

    console.log(dashboardData);
    return dashboardData;
}

function updateTemperatureTrend(trendDirection, hourlyChange) {
    const trendContainer = document.getElementById('temp-trend');
    
    // Clear out class lists completely
    trendContainer.className = ''; 

    if (trendDirection === 'UP') {
        const displayValue = Math.abs(hourlyChange).toFixed(1);
        trendContainer.classList.add('trend-up');
        trendContainer.innerHTML = `
            <span class="trend-arrow">↑</span>
            <span class="trend-val">${displayValue}</span>
        `;
    } else if (trendDirection === 'DOWN') {
        const displayValue = Math.abs(hourlyChange).toFixed(1);
        trendContainer.classList.add('trend-down');
        trendContainer.innerHTML = `
            <span class="trend-arrow">↓</span>
            <span class="trend-val">${displayValue}</span>
        `;
    } else {
        trendContainer.classList.add('trend-stable');
        trendContainer.innerHTML = `<span class="trend-arrow">→</span>`;
    }
}

function updatePressureTrend(trendDirection, hourlyChange) {
    const trendContainer = document.getElementById('pressure-trend');

    // Clear out class lists completely
    trendContainer.className = '';

    if (trendDirection === 'UP') {
        const displayValue = Math.abs(hourlyChange).toFixed(1);
        trendContainer.classList.add('pressure-trend-up');
        trendContainer.innerHTML = `
            <span class="trend-arrow">↑</span>
            <span class="trend-val">${displayValue}</span>
        `;
    } else if (trendDirection === 'DOWN') {
        const displayValue = Math.abs(hourlyChange).toFixed(1);
        trendContainer.classList.add('pressure-trend-down');
        trendContainer.innerHTML = `
            <span class="trend-arrow">↓</span>
            <span class="trend-val">${displayValue}</span>
        `;
    } else {
        trendContainer.classList.add('pressure-trend-stable');
        trendContainer.innerHTML = `<span class="trend-arrow">→</span>`;
    }
}

function renderMetrics(weather) {
    document.getElementById("avg-temp").textContent =
        weather?.temperature?.avgTemp ?? "--";

    document.getElementById("min-temp").textContent =
        weather?.temperature?.min ?? "--";

    document.getElementById("max-temp").textContent =
        weather?.temperature?.max ?? "--";

    document.getElementById("avg-pressure").textContent =
        weather?.pressure?.avgPressure ?? "--";

    updateTemperatureTrend(
        weather?.temperatureTrend?.direction, 
        weather?.temperatureTrend?.changeValue
    );

    updatePressureTrend(
        weather?.pressureTrend?.direction,
        weather?.pressureTrend?.changeValue
    );
}

function renderSystemHealth(systemHealth){
    const lastUpdate = document.getElementById("lastUpdate");
    document.getElementById("status").textContent = systemHealth.status;
    document.getElementById("lag").textContent = systemHealth.lagMinutes + ' min';
    document.getElementById("todayRecords").textContent = systemHealth.recordsToday;

    let time = "--:--:--";
    if(systemHealth.lastMeasuredAt != null){
        time = new Date(systemHealth.lastMeasuredAt).toLocaleTimeString('en-GB');
    }

    lastUpdate.textContent = time;


    function renderSystemStatus(){
        const lagText = document.getElementById("status");

        const colors = {
        'LIVE': 'green',
        'DELAYED': 'yellow',
        'STALE': 'orange',
        'OFFLINE': 'red'
        };

        lagText.style.color = colors[systemHealth.status] || 'black';
    }

    renderSystemStatus();
}

async function updateDashboard() {
    try{
        const data = await fetchDashboard();

        const metrics = data.metricsDashboardDto;
        const systemHealth = data.systemHealthDashboardDto;
        const chartPoints = metrics.temperatureChartPoints;

        console.log(chartPoints);
        state.metrics = metrics;
        state.systemHealth = systemHealth;

        renderMetrics(metrics);
        renderSystemHealth(systemHealth);
        renderWeatherChart(chartPoints);
    }
    catch(error){
        console.log(error);
    }
}

function startPolling(fn, interval) {

    let stopped = false;

    async function loop() {

        if (stopped) return;

        await fn();

        setTimeout(loop, interval);
    }

    loop();

    return () => {
        stopped = true;
    };
}


startPolling(updateDashboard, 30000);