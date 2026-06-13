import { renderWeatherChart } from './weather-chart.js';
import { FetchScheduler } from './FetchScheduler.js';

// ==========================================
// STATE
// ==========================================

const state = {
    metrics:           null,
    systemHealth:      null,
    astronomy:         null,
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

const DATA_STATUS_COLORS = {
    LIVE:    '#22c55e',
    DELAYED: '#fcd34d',
    STALE:   '#f97316',
    OFFLINE: '#ef4444',
    EMPTY:   '#6b7280',
};

const DATA_STATUS_INFO = {
    LIVE:    { label: 'Live',    description: 'Data is current and updating normally.' },
    DELAYED: { label: 'Delayed', description: 'Data is slightly behind — last update was 5–10 minutes ago. Current conditions may differ slightly.' },
    STALE:   { label: 'Stale',   description: 'Data has not updated in over 10 minutes. Readings may not reflect current conditions.' },
    OFFLINE: { label: 'Offline', description: 'No data received for over a day. The station may be offline or unreachable.' },
    EMPTY:   { label: 'No data', description: 'No data is available.' },
};

const QUALITY_SEVERITY = { OK: 0, SPIKE: 1, ANOMALY: 2, MISSING: 3 };
const STATUS_SEVERITY  = { LIVE: 0, DELAYED: 1, STALE: 2, OFFLINE: 3, EMPTY: 3 };

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
        title: 'Condensation Imminent',
        explanation: 'Air is nearly saturated. Moisture will form on exposed surfaces very easily.',
        surfaces: [
            'Camera lenses',
            'Telescopes and optics',
            'Car windows',
            'Grass and outdoor furniture'
        ],
        tip: 'Heavy dew, fog, or wet equipment is likely. Protect optics and electronics.'
    },

    VERY_LIKELY: {
        title: 'Condensation Likely',
        explanation: 'Humidity is very high. Surfaces that cool slightly below air temperature may become wet.',
        surfaces: [
            'Metal railings',
            'Camera gear',
            'Garden furniture',
            'Vehicle windows'
        ],
        tip: 'Expect dew overnight. Outdoor equipment may need covers or heaters.'
    },

    POSSIBLE: {
        title: 'Condensation Possible',
        explanation: 'Conditions are moderately humid. Condensation may appear on cooler surfaces.',
        surfaces: [
            'Metal surfaces in shade',
            'Optical equipment',
            'Parked vehicles'
        ],
        tip: 'Most surfaces stay dry, but dew can form after sunset.'
    },

    UNLIKELY: {
        title: 'Condensation Unlikely',
        explanation: 'The air is relatively dry and moisture formation is not expected.',
        surfaces: [],
        tip: 'Good conditions for outdoor activities and observing.'
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

        // Only repaint when the dataset actually changed — an unchanged poll
        // would otherwise force a pointless chart redraw every cycle.
        let changed = false;
        if (state.charts[metric].length === 0) {
            state.charts[metric] = newChartPoints;
            changed = newChartPoints.length > 0;
        } else {
            const existingHours = new Set(state.charts[metric].map(p => p.hour));
            const uniqueDeltas  = newChartPoints.filter(p => !existingHours.has(p.hour));
            if (uniqueDeltas.length > 0) {
                state.charts[metric] = [...state.charts[metric], ...uniqueDeltas];
                changed = true;
            }
        }

        if (changed && metric === state.currentMetric) {
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

// ==========================================
// ASTRONOMY
// ==========================================

function renderAstronomy(astronomy) {
    if (!astronomy) return;

    const formatTime = (isoString) => {
        if (!isoString) return '--:--';
        const date = new Date(isoString);
        return isNaN(date.getTime())
            ? '--:--'
            : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };

    const sunRiseEl  = document.getElementById('sun-rise');
    const sunSetEl   = document.getElementById('sun-set');
    const moonRiseEl = document.getElementById('moon-rise');
    const moonSetEl  = document.getElementById('moon-set');

    if (sunRiseEl)  sunRiseEl.textContent  = formatTime(astronomy.sunDailyEvents?.rise);
    if (sunSetEl)   sunSetEl.textContent   = formatTime(astronomy.sunDailyEvents?.set);
    if (moonRiseEl) moonRiseEl.textContent = formatTime(astronomy.moonDailyEvents?.rise);
    if (moonSetEl)  moonSetEl.textContent  = formatTime(astronomy.moonDailyEvents?.set);
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

function renderMetrics(dto, dataStatus) {
    const temp     = dto?.temperature;
    const pressure = dto?.pressure;
    const humidity = dto?.humidity;
    const wetness  = dto?.surfaceWetness;

    renderTemperature(temp);
    renderPressure(pressure);
    renderHumidity(humidity);
    renderSurfaceWetness(wetness);

    populatePopup('temperature-card', temp?.dataDetails,     dataStatus);
    populatePopup('pressure-card',    pressure?.dataDetails, dataStatus);
    populatePopup('humidity-card',    humidity?.dataDetails, dataStatus);
    populatePopup('wetness-card',     wetness?.dataDetails,  dataStatus);

    setStatusCircleColor(document.querySelector('#temperature-card .status-circle'), temp?.dataDetails?.quality,     dataStatus);
    setStatusCircleColor(document.querySelector('#pressure-card .status-circle'),    pressure?.dataDetails?.quality, dataStatus);
    setStatusCircleColor(document.querySelector('#humidity-card .status-circle'),    humidity?.dataDetails?.quality, dataStatus);
    setStatusCircleColor(document.querySelector('#wetness-card .status-circle'),     wetness?.dataDetails?.quality,  dataStatus);

    updateStalenessHints(dataStatus);
}

async function updateDashboard() {
    try {
        const data         = await fetchDashboard();
        state.metrics      = data.metricsDashboardDto;
        state.systemHealth = data.systemHealthDashboardDto;
        state.astronomy    = data.astronomySnapshot;

        renderMetrics(state.metrics, state.systemHealth?.status);
        renderSystemHealth(state.systemHealth);
        renderAstronomy(state.astronomy);
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

// Matches the mobile breakpoint used for chart layout in weather-chart.js
const MOBILE_BREAKPOINT       = 480;
const MOBILE_MIN_RESOLUTION   = 30;

function isMobileViewport() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
}

// Disables sub-30min options on mobile and forces the selection up to the
// mobile minimum if needed. Returns true if the selected value changed.
function syncResolutionOptions(select) {
    const mobile = isMobileViewport();

    Array.from(select.options).forEach(option => {
        option.disabled = mobile && Number(option.value) < MOBILE_MIN_RESOLUTION;
    });

    if (mobile && Number(select.value) < MOBILE_MIN_RESOLUTION) {
        select.value = String(MOBILE_MIN_RESOLUTION);
        return true;
    }
    return false;
}

function restartChartWithCurrentResolution() {
    state.charts[state.currentMetric] = [];
    renderWeatherChart([], state.currentMetric, state.currentResolution);
    startChart(state.currentMetric);
}

function initResolutionControls() {
    const select = document.getElementById('resolution-selector');
    if (!select) return;

    const saved = localStorage.getItem('chartResolution') ?? '10';
    select.value = saved;

    syncResolutionOptions(select);
    state.currentResolution = Number(select.value);

    select.addEventListener('change', (e) => {
        const value = e.target.value;
        state.currentResolution = Number(value);
        localStorage.setItem('chartResolution', value);
        restartChartWithCurrentResolution();
    });

    window.addEventListener('resize', () => {
        if (!syncResolutionOptions(select)) return;

        state.currentResolution = Number(select.value);
        restartChartWithCurrentResolution();
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

function populatePopup(cardId, details, dataStatus) {
    const card = document.getElementById(cardId);
    if (!card || !details) return;
    card._popupDetails = details;
    card._dataStatus   = dataStatus ?? null;
}

function formatTimeSince(isoString) {
    if (!isoString) return null;
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return null;
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (minutes < 1)   return 'less than a minute';
    if (minutes === 1) return '1 minute';
    if (minutes < 60)  return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1)   return '1 hour';
    if (hours < 24)    return `${hours} hours`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''}`;
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

function buildPopupHTML(details, dataStatus) {
    const qColor    = DATA_QUALITY_COLORS[details.quality] ?? DATA_QUALITY_COLORS.MISSING;
    const dsColor   = DATA_STATUS_COLORS[dataStatus] ?? '#6b7280';
    const dsInfo    = DATA_STATUS_INFO[dataStatus];
    const timeSince = formatTimeSince(details.arrivedAt);

    const freshnessSection = (dataStatus && dataStatus !== 'LIVE') ? `
        <div class="popup-divider"></div>
        <div class="popup-heading" style="margin-top:8px;">Data Freshness</div>
        <div class="popup-row">
            <span class="popup-key">Status</span>
            <span class="popup-val" style="color:${dsColor}; font-weight:700;">${dsInfo?.label ?? dataStatus}</span>
        </div>
        ${timeSince ? `
        <div class="popup-row">
            <span class="popup-key">Not updated for</span>
            <span class="popup-val">${timeSince}</span>
        </div>` : ''}
        <div class="popup-row" style="flex-direction:column; align-items:flex-start; gap:3px;">
            <span class="popup-key">Note</span>
            <span class="popup-val" style="text-align:left; line-height:1.5; font-weight:400;">${dsInfo?.description ?? ''}</span>
        </div>
    ` : '';

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
        ${freshnessSection}
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

function setStatusCircleColor(circleEl, quality, dataStatus) {
    if (!circleEl) return;
    const qSev  = QUALITY_SEVERITY[quality]   ?? 0;
    const dSev  = STATUS_SEVERITY[dataStatus] ?? 0;
    const color = (dSev >= qSev)
        ? (DATA_STATUS_COLORS[dataStatus]  ?? DATA_QUALITY_COLORS.MISSING)
        : (DATA_QUALITY_COLORS[quality]    ?? DATA_QUALITY_COLORS.MISSING);

    circleEl.style.backgroundColor = color;
    circleEl.style.boxShadow       = `0 0 0 2px ${color}33`;
    circleEl.classList.toggle('pulsing', quality === 'OK' && (!dataStatus || dataStatus === 'LIVE'));
}

function updateStalenessHints(dataStatus) {
    const isStale = dataStatus && dataStatus !== 'LIVE';
    const HINT_TARGETS = [
        '#temperature-card .main-value',
        '#pressure-card .main-value',
        '#humidity-card .main-value',
        '#wetness-card .wetness-meta',
    ];
    const HINT_LABELS = { DELAYED: '~ delayed', STALE: '~ stale', OFFLINE: '~ offline', EMPTY: '~ no data' };
    const HINT_COLORS = { DELAYED: '#fcd34d',   STALE: '#f97316',  OFFLINE: '#ef4444',   EMPTY: '#6b7280'   };

    HINT_TARGETS.forEach(selector => {
        const target = document.querySelector(selector);
        if (!target) return;
        const parent = target.parentElement;
        let hint = parent.querySelector('.data-stale-hint');
        if (isStale) {
            if (!hint) {
                hint = document.createElement('span');
                hint.className = 'data-stale-hint';
                target.insertAdjacentElement('afterend', hint);
            }
            hint.textContent = HINT_LABELS[dataStatus] ?? '~ outdated';
            hint.style.color = HINT_COLORS[dataStatus] ?? '#6b7280';
        } else if (hint) {
            hint.remove();
        }
    });
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
            const card       = circle.closest('[id$="-card"]');
            const details    = card?._popupDetails;
            const dataStatus = card?._dataStatus;
            const isOpen     = globalPopup.classList.contains('open')
                            && globalPopup._sourceEl === circle;

            globalPopup.classList.remove('open');
            if (!isOpen && details) openPopup(buildPopupHTML(details, dataStatus), circle);
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