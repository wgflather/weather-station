import { renderWeatherChart } from './weather-chart.js';
import { FetchScheduler } from './FetchScheduler.js';

// ==========================================
// STATE
// ==========================================

const state = {
    metrics: null,
    systemHealth: null,
    currentMetric: 'temperature',
    currentResolution: Number(localStorage.getItem('chartResolution')) || 10,

    charts: {
        temperature: null,
        pressure:    null,
        humidity:    null,
    }
};

// ==========================================
// ENUM MAPPINGS  — all display concerns live here, not on the backend
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
            renderWeatherChart(state.charts[metric], metric);
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

    renderPressureTrend(pressure.pressureTrend);
}

function renderPressureTrend(pressureTrend) {
    const el = document.getElementById('pressure-trend');
    if (!el) return;

    const config = PRESSURE_TREND_CONFIG[pressureTrend] ?? PRESSURE_TREND_CONFIG.STABLE;
    const isStable = pressureTrend === 'STABLE' || !pressureTrend;

    el.className = '';
    el.style.color = config.color;

    el.innerHTML = `
        <span class="pressure-trend-indicator" style="color: ${config.color}">
            ${!isStable ? `<span class="trend-arrow">${config.arrow}</span>` : ''}
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

    // Dew point value
    const dewEl = document.getElementById('humidity-dew-val');
    if (dewEl) {
        dewEl.textContent = humidity.dewPoint != null
            ? `${humidity.dewPoint.toFixed(1)}°C`
            : '--°C';
    }

    // Dew point spread gauge (temperature card) — needs both temp and dewPoint
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

    // We still need temperature for the gauge — read from already-rendered DOM
    const tempText = document.getElementById('avg-temp')?.textContent;
    const temp     = tempText && tempText !== '--' ? parseFloat(tempText) : null;

    if (dewPoint == null || temp == null) {
        spreadValEl.textContent = '--°';
        return;
    }

    const spread  = parseFloat((temp - dewPoint).toFixed(1));
    const percent = Math.min(100, Math.max(0, (spread / 10) * 100));

    spreadValEl.textContent = `${spread.toFixed(1)}°`;
    if (dewTEl)  dewTEl.textContent  = temp.toFixed(1);
    if (dewTdEl) dewTdEl.textContent = dewPoint.toFixed(1);

    pinEl.style.left = `${percent}%`;
    pinEl.setAttribute('data-spread', `${spread.toFixed(1)}°`);

    // Badge from backend enum
    if (badgeEl && risk) {
        const config = DEW_POINT_RISK_CONFIG[risk] ?? DEW_POINT_RISK_CONFIG.UNLIKELY;
        badgeEl.className   = `dew-status-badge ${config.cssClass}`;
        badgeEl.textContent = config.label;
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
    const raw    = wetness?.value;

    // Calculate display percentage from raw ADC (0–4095, inverted)
    const pct = raw != null
        ? ((4095 - Math.min(4095, Math.max(0, raw))) / 4095) * 100
        : null;

    if (pct === null || !status) {
        textEl.textContent = '--';
        pctEl.textContent  = 'Wetness --';
        barEl.style.width  = '0%';
        return;
    }

    const config = SURFACE_WETNESS_CONFIG[status] ?? SURFACE_WETNESS_CONFIG.DRY;

    badgeEl.className          = `wetness-status-badge ${config.cssClass}`;
    textEl.textContent         = config.label;
    pctEl.textContent          = `Wetness ${Math.round(pct)}%`;
    barEl.style.width          = `${pct.toFixed(1)}%`;
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

    // Populate status circle popups
    populatePopup('temperature-card', temp?.dataDetails);
    populatePopup('pressure-card',    pressure?.dataDetails);
    populatePopup('humidity-card',    humidity?.dataDetails);
    populatePopup('wetness-card',     wetness?.dataDetails);

    // Color status circles
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
    const resDesktop  = document.getElementById('resolution-selector');
    const resMobile   = document.getElementById('resolution-selector-mobile');

    if (!resDesktop) return;

    // Hydrate UI from persisted state
    resDesktop.value = String(state.currentResolution);
    if (resMobile) resMobile.value = String(state.currentResolution);

    function onResolutionChange(value) {
        const resolution = parseInt(value, 10);
        state.currentResolution = resolution;
        localStorage.setItem('chartResolution', String(resolution));

        // Keep both selectors in sync
        resDesktop.value = value;
        if (resMobile) resMobile.value = value;

        // Wipe cache and re-fetch
        state.charts[state.currentMetric] = [];
        renderWeatherChart([], state.currentMetric);
        startChart(state.currentMetric);
    }

    resDesktop.addEventListener('change', (e) => onResolutionChange(e.target.value));
    resMobile?.addEventListener('change', (e) => onResolutionChange(e.target.value));
}

function initEventListeners() {
    const metricDesktop = document.getElementById('metric-selector');
    const metricMobile  = document.getElementById('metric-selector-mobile');
    const toggleBtn     = document.getElementById('chart-controls-toggle');
    const mobilePanel   = document.getElementById('chart-controls-mobile');

    if (!metricDesktop) return;

    state.currentMetric = metricDesktop.value;

    // Resolution must be ready before chart starts
    initResolutionControls();
    startChart(state.currentMetric);

    function onMetricChange(value) {
        state.currentMetric = value;
        metricDesktop.value = value;
        if (metricMobile) metricMobile.value = value;

        if (!state.charts[value]) state.charts[value] = [];
        renderWeatherChart(state.charts[value], value);
        startChart(value);
    }

    metricDesktop.addEventListener('change', (e) => onMetricChange(e.target.value));
    metricMobile?.addEventListener('change', (e) => onMetricChange(e.target.value));

    // Mobile panel toggle
    toggleBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = mobilePanel.classList.toggle('open');
        toggleBtn.classList.toggle('active', isOpen);
    });

    document.addEventListener('click', (e) => {
        if (mobilePanel && !mobilePanel.contains(e.target) && e.target !== toggleBtn) {
            mobilePanel.classList.remove('open');
            toggleBtn?.classList.remove('active');
        }
    });
}

// ==========================================
// STATUS CIRCLE POPUP
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

function setStatusCircleColor(circleEl, quality) {
    if (!circleEl) return;
    const color = DATA_QUALITY_COLORS[quality] ?? DATA_QUALITY_COLORS.MISSING;
    circleEl.style.backgroundColor = color;
    circleEl.style.boxShadow       = `0 0 0 2px ${color}33`;
}

function positionPopup(circle) {
    const r      = circle.getBoundingClientRect();
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

function initStatusCircles() {
    document.querySelectorAll('.status-circle').forEach(circle => {
        circle.addEventListener('click', (e) => {
            e.stopPropagation();
            const card    = circle.closest('[id$="-card"]');
            const details = card?._popupDetails;
            const isOpen  = globalPopup.classList.contains('open')
                         && globalPopup._sourceCircle === circle;

            globalPopup.classList.remove('open');

            if (!isOpen && details) {
                globalPopup.innerHTML     = buildPopupHTML(details);
                globalPopup._sourceCircle = circle;
                globalPopup.classList.add('open');
                requestAnimationFrame(() => positionPopup(circle));
            }
        });
    });

    document.addEventListener('click', () => globalPopup.classList.remove('open'));

    window.addEventListener('scroll', () => {
        if (globalPopup.classList.contains('open') && globalPopup._sourceCircle) {
            positionPopup(globalPopup._sourceCircle);
        }
    }, { passive: true });

    window.addEventListener('resize', () => {
        if (globalPopup.classList.contains('open') && globalPopup._sourceCircle) {
            positionPopup(globalPopup._sourceCircle);
        }
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

initEventListeners();
initStatusCircles();
startPolling(updateDashboard, 30000);