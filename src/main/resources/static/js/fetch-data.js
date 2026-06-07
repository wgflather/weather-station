import { renderWeatherChart } from './weather-chart.js';
import { FetchScheduler } from './FetchScheduler.js';

const state = {
    metrics: null,
    systemHealth: null,
    currentMetric: 'temperature',
    currentResolution: Number(localStorage.getItem('resolution')) || 10,

    charts: {
        temperature: null,
        pressure:    null,
        humidity:    null,
    }
};

const QUALITY_STYLE = {
    OK:      { color: '#22c55e', label: 'OK' },        // green
    SPIKE:   { color: '#f59e0b', label: 'SPIKE' },     // orange
    ANOMALY: { color: '#ef4444', label: 'ANOMALY' },   // red
    MISSING: { color: '#111827', label: 'MISSING' }    // near black
};

function getMetric(dto, key) {
    return dto?.[key] ?? null;
}

function getQualityStyle(quality) {
    return QUALITY_STYLE[quality] ?? QUALITY_STYLE.MISSING;
}

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
            const uniqueDeltas = newChartPoints.filter(p => !existingHours.has(p.hour));
            state.charts[metric] = [...state.charts[metric], ...uniqueDeltas];
        }

        if (metric === state.currentMetric) {
            renderWeatherChart(state.charts[metric], metric);
        }
    },

    20000
);

function startChart(metric) {
    scheduler.start(
        metric,
        (m) => state.charts[m],
        state.currentResolution  
    );
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

/* =========================================================
   PRESSURE TREND STATE CLASSIFICATION
   Thresholds based on standard meteorological convention:
     < 0.5 hPa/h  → stable
     0.5–1.5      → slowly rising/falling
     1.5–3.0      → rising/falling
     > 3.0        → rapidly rising/falling
========================================================= */
function classifyPressureTrend(direction, changePerHour) {
    const abs = Math.abs(changePerHour ?? 0);

    if (abs < 0.5) {
        return {
            cssClass: 'pressure-stable',
            arrow: '',
            label: 'Stable'
        };
    }

    if (direction === 'UP') {
        if (abs < 1.5) return { cssClass: 'pressure-rising-slow', arrow: '↑', label: 'Slowly rising' };
        if (abs < 3.0) return { cssClass: 'pressure-rising', arrow: '↑', label: 'Rising' };
        return { cssClass: 'pressure-rising-fast', arrow: '↑', label: 'Rapidly rising' };
    }

    if (direction === 'DOWN') {
        if (abs < 1.5) return { cssClass: 'pressure-falling-slow', arrow: '↓', label: 'Slowly falling' };
        if (abs < 3.0) return { cssClass: 'pressure-falling', arrow: '↓', label: 'Falling' };
        return { cssClass: 'pressure-falling-fast', arrow: '↓', label: 'Rapidly falling' };
    }

    return {
        cssClass: 'pressure-stable',
        arrow: '',
        label: 'Stable'
    };
}

function updatePressureTrend(direction, changeValue) {
    const el = document.getElementById('pressure-trend');
    if (!el) return;

    const absVal = Math.abs(changeValue ?? 0);

    const { cssClass, arrow, label } =
        classifyPressureTrend(direction, changeValue);

    const showArrow = absVal > 0.4 && arrow;

    const valStr =
        absVal > 0.5
            ? `<span class="trend-val">${absVal.toFixed(1)}/h</span>`
            : '';

    el.className = cssClass;

    el.innerHTML = `
        <span class="pressure-trend-indicator">
            ${showArrow ? `<span class="trend-arrow">${arrow}</span>` : ''}
            ${valStr}
        </span>
        <span class="pressure-trend-label">${label}</span>
    `;
}

// ==========================================
// METEOROLOGICAL CALCULATIONS
// ==========================================

function calculateDewPoint(temp, humidity) {
    if (temp == null || humidity == null) return null;
    const a     = 17.625;
    const b     = 243.04;
    const alpha = Math.log(humidity / 100) + (a * temp) / (b + temp);
    return (b * alpha) / (a - alpha);
}

function updateDewPointSpreadGauge(temp, humidity) {
    const tdVal = calculateDewPoint(temp, humidity);

    const spreadValEl = document.getElementById("dew-spread-val");
    const dewTEl      = document.getElementById("dew-t");
    const dewTdEl     = document.getElementById("dew-td");
    const badgeEl     = document.getElementById("dew-status");
    const pinEl       = document.getElementById("gauge-pin");

    if (tdVal === null) {
        if (spreadValEl) spreadValEl.textContent = "--°";
        return;
    }

    const spread  = temp - tdVal;
    const percent = Math.min(100, Math.max(0, (spread / 10) * 100));

    spreadValEl.textContent = `${spread.toFixed(1)}°`;
    dewTEl.textContent      = temp.toFixed(1);
    dewTdEl.textContent     = tdVal.toFixed(1);
    pinEl.style.left        = `${percent}%`;
    pinEl.setAttribute('data-spread', `${spread.toFixed(1)}°`);

    badgeEl.className = "dew-status-badge";
    if (spread <= 2) {
        badgeEl.textContent = "Danger";
        badgeEl.classList.add("trend-up");
    } else if (spread <= 4) {
        badgeEl.textContent = "High Risk";
        badgeEl.classList.add("trend-up");
    } else if (spread <= 6.5) {
        badgeEl.textContent = "Caution";
        badgeEl.classList.add("trend-stable");
    } else {
        badgeEl.textContent = "Safe";
        badgeEl.classList.add("trend-stable");
    }
}

/* =========================================================
   SURFACE WETNESS
   HW-028 rain sensor: raw ADC 0–4095 (12-bit),
   HIGH value = dry, LOW value = wet  →  invert to get wetness %
========================================================= */
const ADC_MAX = 4095;

function rawToWetnessPct(raw) {
    if (raw == null) return null;
    const clamped = Math.min(ADC_MAX, Math.max(0, raw));
    return ((ADC_MAX - clamped) / ADC_MAX) * 100;
}

function classifyWetness(pct) {
    if (pct < 10)  return { cssClass: 'wetness-dry',    label: 'Dry',    barColor: '#4ade80' };
    if (pct < 40)  return { cssClass: 'wetness-damp',   label: 'Damp',   barColor: '#facc15' };
    if (pct < 70)  return { cssClass: 'wetness-wet',    label: 'Wet',    barColor: '#38bdf8' };
                   return { cssClass: 'wetness-soaked', label: 'Soaked', barColor: '#818cf8' };
}

function updateSurfaceWetness(raw) {
    const badgeEl  = document.getElementById('wetness-badge');
    const textEl   = document.getElementById('wetness-status-text');
    const pctEl    = document.getElementById('wetness-pct');
    const barEl    = document.getElementById('wetness-bar');

    if (!badgeEl) return;

    const pct = rawToWetnessPct(raw);
    if (pct === null) {
        textEl.textContent = '--';
        pctEl.textContent  = 'Wetness --';
        barEl.style.width  = '0%';
        return;
    }

    const { cssClass, label, barColor } = classifyWetness(pct);

    // Update badge state class
    badgeEl.className = `wetness-status-badge ${cssClass}`;
    textEl.textContent = label;

    // Update percentage label and bar
    pctEl.textContent          = `Wetness ${pct.toFixed(0)}%`;
    barEl.style.width          = `${pct.toFixed(1)}%`;
    barEl.style.backgroundColor = barColor;
}

function formatArrivedAt(value) {
    if (!value) return '--';

    const date = new Date(value);
    if (isNaN(date.getTime())) return '--';

    return date.toLocaleString('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function setStatusCircleColor(circleEl, quality) {
    if (!circleEl) return;

    const { color } = getQualityStyle(quality);

    circleEl.style.backgroundColor = color;
    circleEl.style.boxShadow = `0 0 0 2px ${color}33`; // subtle glow
}


// ==========================================
// MAIN RENDER
// ==========================================

function renderMetrics(dto) {
    const temp     = getMetric(dto, "temperature");
    const pressure = getMetric(dto, "pressure");
    const hum      = getMetric(dto, "humidity");
    const wetness  = getMetric(dto, "surfaceWetness");

    // =========================
    // Temperature
    // =========================
    document.getElementById("avg-temp").textContent = temp?.value ?? "--";
    document.getElementById("min-temp").textContent  = temp?.min ?? "--";
    document.getElementById("max-temp").textContent  = temp?.max ?? "--";

    updateTemperatureTrend(
        temp?.trendResult?.direction,
        temp?.trendResult?.changeValue
    );

    // =========================
    // Pressure
    // =========================
    document.getElementById("avg-pressure").textContent = pressure?.value ?? "--";

    updatePressureTrend(
        pressure?.trendResult?.direction,
        pressure?.trendResult?.changeValue
    );

    // =========================
    // Humidity
    // =========================
    const humVal = hum?.value;

    if (humVal != null) {
        document.getElementById("humidity-val").textContent = humVal;
    }

    // Dew point
    const dewEl = document.getElementById("humidity-dew-val");
    if (dewEl) {
        const td = calculateDewPoint(temp?.value, humVal);
        dewEl.textContent = td !== null ? `${td.toFixed(1)}°C` : "--°C";
    }

    // =========================
    // Dew point spread (temperature card)
    // =========================
    updateDewPointSpreadGauge(temp?.value, humVal);

    // =========================
    // Surface wetness
    // =========================
    updateSurfaceWetness(wetness?.value);

    populatePopup('wetness-card', wetness?.dataDetails);
        populatePopup('temperature-card', temp?.dataDetails);
        populatePopup('pressure-card', pressure?.dataDetails);
        populatePopup('humidity-card', hum?.dataDetails);

        // NEW: color circles
        setStatusCircleColor(
            document.querySelector('#temperature-card .status-circle'),
            temp?.dataDetails?.quality
        );

        setStatusCircleColor(
            document.querySelector('#pressure-card .status-circle'),
            pressure?.dataDetails?.quality
        );

        setStatusCircleColor(
            document.querySelector('#humidity-card .status-circle'),
            hum?.dataDetails?.quality
        );

        setStatusCircleColor(
            document.querySelector('#wetness-card .status-circle'),
            wetness?.dataDetails?.quality
        );
}

async function updateDashboard() {
    try {
        const data = await fetchDashboard();
        state.metrics      = data.metricsDashboardDto;
        state.systemHealth = data.systemHealthDashboardDto;

        renderMetrics(state.metrics);
        renderSystemHealth(state.systemHealth);
    } catch (error) {
        console.error(error);
    }
}

function renderSystemHealth(systemHealth) {
    document.getElementById("status").textContent       = systemHealth.status;
    document.getElementById("lag").textContent          = systemHealth.lagMinutes + ' min';
    document.getElementById("todayRecords").textContent = systemHealth.recordsToday;

    const lastUpdate = document.getElementById("lastUpdate");
    lastUpdate.textContent = systemHealth.lastMeasuredAt
        ? new Date(systemHealth.lastMeasuredAt).toLocaleTimeString('en-GB')
        : "--:--:--";

    const colors = { LIVE: 'green', DELAYED: 'yellow', STALE: 'orange', OFFLINE: 'red' };
    document.getElementById("status").style.color = colors[systemHealth.status] || 'black';
}

function initResolutionFromMemory() {
    const selector = document.getElementById('resolution-selector');
    if (!selector) return;

    // sync UI → state (initial load only)
    selector.value = String(state.currentResolution);
}

function initResolutionControls() {
    const btn = document.getElementById('resolution-btn');
    const panel = document.getElementById('resolution-panel');
    const select = document.getElementById('resolution-selector');

    if (!select) return;

    // ---- load persisted value or default ----
    const saved = localStorage.getItem('resolution');
    if (saved) {
        select.value = saved;
    } else {
        select.value = '10'; // DEFAULT 10 min
        localStorage.setItem('resolution', '10');
    }

    state.currentResolution = Number(select.value);

    // sync mobile buttons state
    function setResolution(val) {
        state.currentResolution = Number(val);

        localStorage.setItem('resolution', val);

        // sync desktop select
        if (select) select.value = val;

        // reset charts + restart stream
        state.charts[state.currentMetric] = [];
        renderWeatherChart([], state.currentMetric);
        startChart(state.currentMetric);
    }

    // desktop select
    select.addEventListener('change', (e) => {
        setResolution(e.target.value);
    });

    // mobile button toggle
    if (btn && panel) {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            panel.classList.toggle('open');
        });

        // click options
        panel.querySelectorAll('button[data-value]').forEach(b => {
            b.addEventListener('click', () => {
                setResolution(b.dataset.value);
                panel.classList.remove('open');
            });
        });

        // close on outside click
        document.addEventListener('click', () => {
            panel.classList.remove('open');
        });
    }
}

function initResolutionToggle() {
    const wrapper = document.getElementById('resolution-wrapper');
    const toggle  = document.getElementById('resolution-toggle');
    const select  = document.getElementById('resolution-selector');

    if (!wrapper || !toggle || !select) return;

    function updateLabel() {
        const val = select.value;
        toggle.textContent = `${val}m ▾`;
    }

    updateLabel();

    select.addEventListener('change', () => {
        updateLabel();
    });

    toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.classList.toggle('open');
    });

    document.addEventListener('click', () => {
        wrapper.classList.remove('open');
    });
}

function initEventListeners() {
    const selector = document.getElementById('metric-selector');
    if (!selector) return;

    state.currentMetric = selector.value;

    // IMPORTANT: resolution must already be loaded before chart starts
    initResolutionControls();

    startChart(state.currentMetric);

    selector.addEventListener('change', (event) => {
        const selectedMetric = event.target.value;

        state.currentMetric = selectedMetric;

        if (!state.charts[selectedMetric]) {
            state.charts[selectedMetric] = [];
        }

        renderWeatherChart(state.charts[selectedMetric], selectedMetric);
        startChart(selectedMetric);
    });
}

function loadResolution() {
    const saved = localStorage.getItem('chartResolution');
    return saved ? Number(saved) : 5;
}

function saveResolution(res) {
    localStorage.setItem('chartResolution', String(res));
}

function initResolutionListener() {
    const selector = document.getElementById('resolution-selector');
    if (!selector) return;

    // ✅ hydrate state FIRST
    state.currentResolution = loadResolution();

    // ✅ sync UI to state (THIS IS THE MISSING PIECE)
    selector.value = String(state.currentResolution);

    selector.addEventListener('change', (event) => {
        const newResolution = Number(event.target.value);

        state.currentResolution = newResolution;
        saveResolution(newResolution);

        state.charts[state.currentMetric] = [];
        renderWeatherChart([], state.currentMetric);
        startChart(state.currentMetric);
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

// ─── Status circle popup ──────────────────────────────────────────────────────
// Single shared popup, appended to <body>
const globalPopup = document.getElementById('global-popup');

function populatePopup(cardId, details) {
    // Store details on the circle's card for later use by click handler
    const card = document.getElementById(cardId);
    if (!card || !details) return;
    card._popupDetails = details;
}

function buildPopupHTML(details) {
    const sensor     = details.sensor     ?? '--';
    const lastValue  = details.lastValue  ?? '--';
    const quality    = details.quality    ?? 'MISSING';
    const metricName = details.metricName ?? '--';
    const arrivedAt  = formatArrivedAt(details.arrivedAt);
    const qStyle     = getQualityStyle(quality);

    return `
        <div class="popup-heading">${metricName} - Last Measurement</div>
        <div class="popup-row">
            <span class="popup-key">Sensor</span>
            <span class="popup-val">${sensor}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Last value</span>
            <span class="popup-val">${lastValue}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Quality</span>
            <span class="popup-val" style="color:${qStyle.color}; font-weight:600;">${quality}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Arrived</span>
            <span class="popup-val">${arrivedAt}</span>
        </div>
    `;
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

            // Always close first
            globalPopup.classList.remove('open');

            if (!isOpen && details) {
                globalPopup.innerHTML       = buildPopupHTML(details);
                globalPopup._sourceCircle   = circle;
                globalPopup.classList.add('open');
                requestAnimationFrame(() => positionPopup(circle));
            }
        });
    });

    document.addEventListener('click', () => {
        globalPopup.classList.remove('open');
    });

    // Reposition on scroll/resize in case the card moves
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

// ─── Boot ─────────────────────────────────────────────────────────────────────
initEventListeners();        // sets up listeners
initStatusCircles();

// ✅ sync UI + state BEFORE scheduler starts
initResolutionFromMemory();

// now safe to start polling / charts
startPolling(updateDashboard, 30000);