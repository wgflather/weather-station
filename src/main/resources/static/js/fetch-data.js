import { renderWeatherChart } from './weather-chart.js';
import { FetchScheduler } from './FetchScheduler.js';

// ==========================================
// STATE
// ==========================================

const state = {
    metrics:           null,
    systemHealth:      null,
    currentMetric:     'temperature',
    currentResolution: Number(localStorage.getItem('chartResolution')) || 10,

    charts: {
        temperature: null,
        pressure:    null,
        humidity:    null,
    }
};

// ==========================================
// ENUM MAPPINGS
// ==========================================

const DATA_QUALITY_COLORS = {
    OK:      '#22c55e',
    SPIKE:   '#f59e0b',
    ANOMALY: '#ef4444',
    MISSING: '#111827',
};

const PRESSURE_TREND_CONFIG = {
    RISING_FAST:  { arrow: '↑', label: 'Rapidly rising',  color: '#fca5a5' },
    RISING:       { arrow: '↑', label: 'Rising',           color: '#fcd34d' },
    RISING_SLOW:  { arrow: '↑', label: 'Slowly rising',   color: '#d1fae5' },
    STABLE:       { arrow: '→', label: 'Stable',           color: '#cbd5e1' },
    FALLING_SLOW: { arrow: '↓', label: 'Slowly falling',  color: '#bae6fd' },
    FALLING:      { arrow: '↓', label: 'Falling',          color: '#7dd3fc' },
    FALLING_FAST: { arrow: '↓', label: 'Rapidly falling', color: '#60a5fa' },
};

const DEW_POINT_RISK_CONFIG = {
    SATURATED:   { label: 'Condensation Imminent', cssClass: 'trend-up'     },
    VERY_LIKELY: { label: 'Condensation Likely',   cssClass: 'trend-up'     },
    POSSIBLE:    { label: 'Condensation Possible', cssClass: 'trend-stable' },
    UNLIKELY:    { label: 'Condensation Unlikely', cssClass: 'trend-stable' },
};

const SURFACE_WETNESS_CONFIG = {
    DRY:    { label: 'Dry',    cssClass: 'wetness-dry',    barColor: '#4ade80' },
    DAMP:   { label: 'Damp',   cssClass: 'wetness-damp',   barColor: '#facc15' },
    WET:    { label: 'Wet',    cssClass: 'wetness-wet',    barColor: '#38bdf8' },
    SOAKED: { label: 'Soaked', cssClass: 'wetness-soaked', barColor: '#818cf8' },
};

const DEW_POINT_RISK_INFO = {
    SATURATED: {
        title:       'Condensation Imminent',
        explanation: 'Air is nearly saturated. Water droplets will form on most surfaces.',
        surfaces:    ['Metal objects', 'Glass windows', 'Car bodywork', 'Leaves and grass'],
        tip:         'Fog or heavy dew is likely. Avoid leaving sensitive equipment outdoors.'
    },
    VERY_LIKELY: {
        title:       'Condensation Likely',
        explanation: 'Spread is very small. Cold or poorly insulated surfaces will collect moisture.',
        surfaces:    ['Cold pipes', 'Single-pane windows', 'Metal tools', 'Outdoor furniture'],
        tip:         'Morning dew expected. Cover or store moisture-sensitive items.'
    },
    POSSIBLE: {
        title:       'Condensation Possible',
        explanation: 'Moderate spread. Condensation may form on surfaces significantly cooler than air temperature.',
        surfaces:    ['Cold drinks left outside', 'Underground pipes', 'Shaded metal surfaces'],
        tip:         'Low risk for most surfaces. Watch for dew on exposed metal overnight.'
    },
    UNLIKELY: {
        title:       'Condensation Unlikely',
        explanation: 'Large spread between air and dew point. Air is relatively dry.',
        surfaces:    [],
        tip:         'Comfortable conditions. No condensation risk for typical outdoor surfaces.'
    }
};

// ==========================================
// CHART SCHEDULER
// ==========================================

const scheduler = new FetchScheduler(
    async (metric, existingChart, resolution) => {
        let url = `/api/weather/chart?metric=${metric}&resolution=${resolution}`;

        if (existingChart && existingChart.length > 0) {
            const lastBucket = existingChart[existingChart.length - 1].hour;
            url += `&since=${encodeURIComponent(lastBucket)}`;
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Chart fetch failed for ${metric}`);
        return await response.json();
    },

    (newChartPoints, metric) => {
        if (!state.charts[metric]) state.charts[metric] = [];

        if (state.charts[metric].length === 0) {
            state.charts[metric] = newChartPoints;
        } else {
            const existingHours = new Set(state.charts[metric].map(p => p.hour));
            const uniqueDeltas  = newChartPoints.filter(p => !existingHours.has(p.hour));
            state.charts[metric] = [...state.charts[metric], ...uniqueDeltas];
        }

        if (metric === state.currentMetric) {
            renderWeatherChart(state.charts[metric], metric, state.currentResolution);
        }
    },

    20000
);

function startChart(metric) {
    scheduler.start(metric, (m) => state.charts[m], state.currentResolution);
}

// ==========================================
// DASHBOARD FETCH
// ==========================================

async function fetchDashboard() {
    const response = await fetch('/api/weather/dashboard');
    if (!response.ok) throw new Error('Dashboard fetch failed');
    return await response.json();
}

// ==========================================
// TEMPERATURE
// ==========================================

function renderTemperature(temp) {
    if (!temp) return;
    document.getElementById('avg-temp').textContent = temp.value ?? '--';
    document.getElementById('min-temp').textContent = temp.min   ?? '--';
    document.getElementById('max-temp').textContent = temp.max   ?? '--';
    renderTemperatureTrend(temp.trendResult);
}

function renderTemperatureTrend(trendResult) {
    const el = document.getElementById('temp-trend');
    if (!el) return;

    const direction   = trendResult?.direction;
    const changeValue = trendResult?.changeValue ?? 0;

    el.className = '';

    if (direction === 'UP') {
        el.classList.add('trend-up');
        el.innerHTML = `
            <span class="trend-arrow">↑</span>
            <span class="trend-val">${Math.abs(changeValue).toFixed(1)}/h</span>
        `;
    } else if (direction === 'DOWN') {
        el.classList.add('trend-down');
        el.innerHTML = `
            <span class="trend-arrow">↓</span>
            <span class="trend-val">${Math.abs(changeValue).toFixed(1)}/h</span>
        `;
    } else {
        el.classList.add('trend-stable');
        el.innerHTML = `<span class="trend-arrow">→</span>`;
    }
}

// ==========================================
// PRESSURE
// ==========================================

function renderPressure(pressure) {
    if (!pressure) return;
    document.getElementById('avg-pressure').textContent = pressure.value ?? '--';
    renderPressureTrend(pressure.pressureTrend, pressure.trendResult?.changeValue);
}

function renderPressureTrend(pressureTrend, changeValue) {
    const el = document.getElementById('pressure-trend');
    if (!el) return;

    const config   = PRESSURE_TREND_CONFIG[pressureTrend] ?? PRESSURE_TREND_CONFIG.STABLE;
    const isStable = pressureTrend === 'STABLE' || !pressureTrend;
    const absVal   = Math.abs(changeValue ?? 0);
    const valStr   = !isStable && absVal > 0
        ? `<span class="trend-val">${absVal.toFixed(1)}/h</span>`
        : '';

    el.className   = '';
    el.style.color = config.color;

    el.innerHTML = `
        <span class="pressure-trend-indicator" style="color: ${config.color}">
            ${!isStable ? `<span class="trend-arrow">${config.arrow}</span>` : ''}
            ${valStr}
        </span>
        <span class="pressure-trend-label" style="color: ${config.color}">${config.label}</span>
    `;
}

// ==========================================
// HUMIDITY + DEW POINT
// ==========================================

function renderHumidity(humidity) {
    if (!humidity) return;

    const humVal = humidity.value;
    if (humVal != null) {
        document.getElementById('humidity-val').textContent = humVal;
    }

    const dewEl = document.getElementById('humidity-dew-val');
    if (dewEl) {
        dewEl.textContent = humidity.dewPoint != null
            ? `${humidity.dewPoint.toFixed(1)}°C`
            : '--°C';
    }

    renderDewPointGauge(humidity);
}

function renderDewPointGauge(humidity) {
    const spreadValEl = document.getElementById('dew-spread-val');
    const dewTEl      = document.getElementById('dew-t');
    const dewTdEl     = document.getElementById('dew-td');
    const badgeEl     = document.getElementById('dew-status');
    const pinEl       = document.getElementById('gauge-pin');

    if (!spreadValEl || !pinEl) return;

    const dewPoint = humidity?.dewPoint;
    const risk     = humidity?.dewPointRisk;

    const tempText = document.getElementById('avg-temp')?.textContent;
    const temp     = tempText && tempText !== '--' ? parseFloat(tempText) : null;

    if (dewPoint == null || temp == null) {
        spreadValEl.textContent = '--°';
        return;
    }

    const spread  = parseFloat((temp - dewPoint).toFixed(1));
    const percent = Math.min(100, Math.max(0, (spread / 10) * 100));

    spreadValEl.textContent  = `${spread.toFixed(1)}°`;
    if (dewTEl)  dewTEl.textContent  = temp.toFixed(1);
    if (dewTdEl) dewTdEl.textContent = dewPoint.toFixed(1);

    pinEl.style.left = `${percent}%`;
    pinEl.setAttribute('data-spread', `${spread.toFixed(1)}°`);

    if (badgeEl && risk) {
        const config      = DEW_POINT_RISK_CONFIG[risk] ?? DEW_POINT_RISK_CONFIG.UNLIKELY;
        badgeEl.className   = `dew-status-badge ${config.cssClass}`;
        badgeEl.textContent = config.label;
        badgeEl.style.cursor = 'pointer';
        badgeEl._dewRisk    = risk;
    }
}

// ==========================================
// SURFACE WETNESS
// ==========================================

function renderSurfaceWetness(wetness) {
    const badgeEl = document.getElementById('wetness-badge');
    const textEl  = document.getElementById('wetness-status-text');
    const pctEl   = document.getElementById('wetness-pct');
    const barEl   = document.getElementById('wetness-bar');

    if (!badgeEl) return;

    const status = wetness?.surfaceWetnessStatus;
    const pct    = wetness?.value;

    if (pct == null || !status) {
        textEl.textContent = '--';
        pctEl.textContent  = 'Wetness --';
        barEl.style.width  = '0%';
        return;
    }

    const config = SURFACE_WETNESS_CONFIG[status] ?? SURFACE_WETNESS_CONFIG.DRY;

    badgeEl.className           = `wetness-status-badge ${config.cssClass}`;
    textEl.textContent          = config.label;
    pctEl.textContent           = `Wetness ${Math.round(pct)}%`;
    barEl.style.width           = `${pct.toFixed(1)}%`;
    barEl.style.backgroundColor = config.barColor;
}

// ==========================================
// MAIN RENDER
// ==========================================

function renderMetrics(dto) {
    const temp     = dto?.temperature;
    const pressure = dto?.pressure;
    const humidity = dto?.humidity;
    const wetness  = dto?.surfaceWetness;

    renderTemperature(temp);
    renderPressure(pressure);
    renderHumidity(humidity);
    renderSurfaceWetness(wetness);

    populatePopup('temperature-card', temp?.dataDetails);
    populatePopup('pressure-card',    pressure?.dataDetails);
    populatePopup('humidity-card',    humidity?.dataDetails);
    populatePopup('wetness-card',     wetness?.dataDetails);

    setStatusCircleColor(document.querySelector('#temperature-card .status-circle'), temp?.dataDetails?.quality);
    setStatusCircleColor(document.querySelector('#pressure-card .status-circle'),    pressure?.dataDetails?.quality);
    setStatusCircleColor(document.querySelector('#humidity-card .status-circle'),    humidity?.dataDetails?.quality);
    setStatusCircleColor(document.querySelector('#wetness-card .status-circle'),     wetness?.dataDetails?.quality);
}

async function updateDashboard() {
    try {
        const data         = await fetchDashboard();
        state.metrics      = data.metricsDashboardDto;
        state.systemHealth = data.systemHealthDashboardDto;
        renderMetrics(state.metrics);
        renderSystemHealth(state.systemHealth);
    } catch (error) {
        console.error('Dashboard update failed:', error);
    }
}

// ==========================================
// SYSTEM HEALTH
// ==========================================

function renderSystemHealth(systemHealth) {
    if (!systemHealth) return;

    document.getElementById('status').textContent       = systemHealth.status;
    document.getElementById('lag').textContent          = systemHealth.lagMinutes + ' min';
    document.getElementById('todayRecords').textContent = systemHealth.recordsToday;

    const lastUpdate = document.getElementById('lastUpdate');
    lastUpdate.textContent = systemHealth.lastMeasuredAt
        ? new Date(systemHealth.lastMeasuredAt).toLocaleTimeString('en-GB')
        : '--:--:--';

    const colors = { LIVE: '#22c55e', DELAYED: '#fcd34d', STALE: '#f97316', OFFLINE: '#ef4444' };
    document.getElementById('status').style.color = colors[systemHealth.status] ?? '#ffffff';
}

// ==========================================
// RESOLUTION + METRIC CONTROLS
// ==========================================

function initResolutionControls() {
    const select = document.getElementById('resolution-selector');
    if (!select) return;

    const saved = localStorage.getItem('chartResolution') ?? '10';
    select.value            = saved;
    state.currentResolution = Number(saved);

    select.addEventListener('change', (e) => {
        const value = e.target.value;
        state.currentResolution = Number(value);
        localStorage.setItem('chartResolution', value);

        state.charts[state.currentMetric] = [];
        renderWeatherChart([], state.currentMetric, state.currentResolution);
        startChart(state.currentMetric);
    });
}

function initEventListeners() {
    const metricSelector = document.getElementById('metric-selector');
    if (!metricSelector) return;

    state.currentMetric = metricSelector.value;

    initResolutionControls();
    startChart(state.currentMetric);

    metricSelector.addEventListener('change', (e) => {
        const value         = e.target.value;
        state.currentMetric = value;

        if (!state.charts[value]) state.charts[value] = [];
        renderWeatherChart(state.charts[value], value, state.currentResolution);
        startChart(value);
    });
}

// ==========================================
// STATUS CIRCLE + DEW RISK POPUPS
// ==========================================

const globalPopup = document.getElementById('global-popup');

function populatePopup(cardId, details) {
    const card = document.getElementById(cardId);
    if (!card || !details) return;
    card._popupDetails = details;
}

function formatArrivedAt(value) {
    if (!value) return '--';
    const date = new Date(value);
    if (isNaN(date.getTime())) return '--';
    return date.toLocaleString('en-GB', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function buildPopupHTML(details) {
    const qColor = DATA_QUALITY_COLORS[details.quality] ?? DATA_QUALITY_COLORS.MISSING;
    return `
        <div class="popup-heading">${details.metricName ?? '--'} — Last Measurement</div>
        <div class="popup-row">
            <span class="popup-key">Sensor</span>
            <span class="popup-val">${details.sensor ?? '--'}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Last value</span>
            <span class="popup-val">${details.lastValue ?? '--'}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Quality</span>
            <span class="popup-val" style="color:${qColor}; font-weight:600;">${details.quality ?? '--'}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Arrived</span>
            <span class="popup-val">${formatArrivedAt(details.arrivedAt)}</span>
        </div>
    `;
}

function buildDewRiskPopupHTML(risk) {
    const info = DEW_POINT_RISK_INFO[risk];
    if (!info) return '';

    const surfacesList = info.surfaces.length
        ? `<div class="popup-row" style="flex-direction:column; align-items:flex-start; gap:4px;">
               <span class="popup-key">At-risk surfaces</span>
               <span class="popup-val" style="text-align:left; line-height:1.6">
                   ${info.surfaces.join(' · ')}
               </span>
           </div>`
        : '';

    return `
        <div class="popup-heading">${info.title}</div>
        <div class="popup-row" style="flex-direction:column; align-items:flex-start; gap:4px;">
            <span class="popup-key">What this means</span>
            <span class="popup-val" style="text-align:left; line-height:1.6">${info.explanation}</span>
        </div>
        ${surfacesList}
        <div class="popup-row" style="flex-direction:column; align-items:flex-start; gap:4px; margin-top:4px;">
            <span class="popup-key" style="color:#38bdf8">Tip</span>
            <span class="popup-val" style="text-align:left; line-height:1.6; color:#38bdf8">${info.tip}</span>
        </div>
    `;
}

function setStatusCircleColor(circleEl, quality) {
    if (!circleEl) return;
    const color = DATA_QUALITY_COLORS[quality] ?? DATA_QUALITY_COLORS.MISSING;
    circleEl.style.backgroundColor = color;
    circleEl.style.boxShadow       = `0 0 0 2px ${color}33`;
    circleEl.classList.toggle('pulsing', quality === 'OK');
}

function positionPopup(anchor) {
    const r      = anchor.getBoundingClientRect();
    const popupW = globalPopup.offsetWidth  || 220;
    const popupH = globalPopup.offsetHeight || 140;
    const margin = 8;
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;

    let top  = r.bottom + margin;
    let left = r.right  - popupW;

    if (left < margin)               left = margin;
    if (left + popupW > vw - margin) left = vw - popupW - margin;
    if (top  + popupH > vh - margin) top  = r.top - popupH - margin;
    if (top  < margin)               top  = margin;

    globalPopup.style.top  = `${Math.round(top)}px`;
    globalPopup.style.left = `${Math.round(left)}px`;
}

function openPopup(html, anchor) {
    globalPopup.innerHTML   = html;
    globalPopup._sourceEl   = anchor;
    globalPopup.classList.add('open');
    requestAnimationFrame(() => positionPopup(anchor));
}

function initStatusCircles() {
    document.querySelectorAll('.status-circle').forEach(circle => {
        circle.addEventListener('click', (e) => {
            e.stopPropagation();
            const card    = circle.closest('[id$="-card"]');
            const details = card?._popupDetails;
            const isOpen  = globalPopup.classList.contains('open')
                         && globalPopup._sourceEl === circle;

            globalPopup.classList.remove('open');
            if (!isOpen && details) openPopup(buildPopupHTML(details), circle);
        });
    });
}

function initDewRiskBadge() {
    const badgeEl = document.getElementById('dew-status');
    if (!badgeEl) return;

    badgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const risk   = badgeEl._dewRisk;
        const isOpen = globalPopup.classList.contains('open')
                    && globalPopup._sourceEl === badgeEl;

        globalPopup.classList.remove('open');
        if (!isOpen && risk) openPopup(buildDewRiskPopupHTML(risk), badgeEl);
    });
}

// ==========================================
// POLLING
// ==========================================

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

// ==========================================
// BOOT
// ==========================================

document.addEventListener('click', () => globalPopup.classList.remove('open'));

window.addEventListener('scroll', () => {
    if (globalPopup.classList.contains('open') && globalPopup._sourceEl) {
        positionPopup(globalPopup._sourceEl);
    }
}, { passive: true });

window.addEventListener('resize', () => {
    if (globalPopup.classList.contains('open') && globalPopup._sourceEl) {
        positionPopup(globalPopup._sourceEl);
    }
});

initEventListeners();
initStatusCircles();
initDewRiskBadge();
startPolling(updateDashboard, 30000);