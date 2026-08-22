import { renderWeatherChart } from './weather-chart.js';
import { FetchScheduler } from './FetchScheduler.js';
import { initStarField, updateStarField, setStarFieldModalDim } from './star-field.js';
import { drawMoon } from './moon-canvas.js';
import { initAstroModal, refreshAstroModal, patchAstroModalLive } from './astro-modal.js';
import {
    initMetricPopovers,
    closeAllPopovers,
    populatePopup,
    setStatusCircleColor,
} from './metric-popovers.js';
import {
    DATA_STATUS_COLORS,
    DATA_STATUS_INFO,
    STATUS_DOT_GLOW,
    PRESSURE_TREND_CONFIG,
    DEW_POINT_RISK_CONFIG,
    SURFACE_WETNESS_CONFIG,
    UV_CSS,
} from './dashboard-constants.js';
import { SKY_ANCHORS } from './sky-colors.js';
import {
    renderSunCurve,
    updateSunNowMarker,
    updateSunHero,
    updateMoonCountdown,
} from './sun-curve.js';
import {
    renderSkyBackground,
    moonAmbientFor,
    loadBgPreference,
    initBgPreference,
} from './sky-background.js';

// ==========================================
// STATE
// ==========================================

const state = {
    metrics:           null,
    systemHealth:      null,
    astronomyDaily:    null,   // sun/moon rise/set/twilights — fetched once + on rollover
    sunSnapshot:       null,   // continuously-changing solar state
    moonSnapshot:      null,   // continuously-changing lunar state
    dailyKey:          null,   // key the cached daily payload was computed under
    currentMetric:     'temperature',
    currentResolution: Number(localStorage.getItem('chartResolution')) || 10,

    charts: {
        temperature: null,
        pressure:    null,
        humidity:    null,
        wind:        null,
        uvIndex:     null,
    },

    // Cached provider per metric, populated on first chart response.
    // Used to lock the resolution selector and pass apiMode to the renderer.
    metricProviders: {},
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

    (chartDto, metric) => {
        const newChartPoints = chartDto.chartPoints ?? [];
        const dataProvider   = chartDto.dataProvider ?? 'LOCAL_SENSOR';
        const isApi          = dataProvider === 'EXTERNAL_API';

        state.metricProviders[metric] = dataProvider;

        if (!state.charts[metric]) state.charts[metric] = [];

        let changed = false;

        if (isApi) {
            // Always replace — the full 24-hour forecast is returned each time,
            // and future-hour predictions can update between polls.
            state.charts[metric] = newChartPoints;
            changed = newChartPoints.length > 0;
        } else {
            // Incremental append — only add buckets that haven't arrived yet.
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
        }

        if (changed && metric === state.currentMetric) {
            syncResolutionForProvider(dataProvider);
            // API data is always hourly — pass resolution=60 so gap detection
            // doesn't treat the 1-hour cadence as missing data.
            const effectiveRes = isApi ? 60 : state.currentResolution;
            renderWeatherChart(state.charts[metric], metric, effectiveRes, { apiMode: isApi });
        }
    },

    20000
);

// Locks the resolution selector when a metric is served by the external API
// (hourly cadence is fixed; custom resolution has no effect).
function syncResolutionForProvider(provider) {
    const resSelect = document.getElementById('resolution-selector');
    if (!resSelect) return;
    const isApi = provider === 'EXTERNAL_API';
    resSelect.disabled = isApi;
    resSelect.title    = isApi ? 'Resolution is fixed at 1 hour for API data' : '';
}

function startChart(metric) {
    scheduler.start(metric, (m) => state.charts[m], state.currentResolution);
}

// ==========================================
// DASHBOARD FETCH
// ==========================================

async function fetchDashboardDaily() {
    const [dailyRes, curveRes] = await Promise.all([
        fetch('/api/astronomy/daily'),
        fetch('/api/astronomy/curve?body=SUN&resolution=CARD'),
    ]);
    if (!dailyRes.ok) throw new Error('Daily dashboard fetch failed');
    if (!curveRes.ok) throw new Error('Sun curve fetch failed');
    const daily = await dailyRes.json();
    const curve = await curveRes.json();
    if (daily.sunDailyEvents) daily.sunDailyEvents.sunCurve = curve.points;
    return daily;
}

async function fetchDashboardLive() {
    const response = await fetch('/api/weather/dashboard/live');
    if (!response.ok) throw new Error('Live dashboard fetch failed');
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


// Sets a moon card time element to HH:MM, with a static +N superscript when the
// event falls on a future day. No interaction — the full date is in the modal.
function setMoonTimeEl(el, isoString) {
    if (!isoString) { el.textContent = '—'; return; }
    const date = new Date(isoString);
    if (isNaN(date.getTime())) { el.textContent = '—'; return; }
    const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const today   = new Date();
    if (date.toDateString() === today.toDateString()) { el.textContent = timeStr; return; }
    const todayMid  = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dateMid   = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayOffset = Math.round((dateMid - todayMid) / 86400000);
    el.innerHTML = `${timeStr}<sup class="moon-future-badge">+${dayOffset}</sup>`;
}

function renderAstronomyDaily(daily) {
    if (!daily) return;
    renderSunCard(daily.sunDailyEvents);
    renderMoonCard(daily.moonDailyEvents);
    // If a modal is open while daily refreshes (midnight rollover or
    // zone change), keep its contents in sync.
    refreshAstroModal();
}

function renderSunCard(sun) {
    if (!sun) return;
    renderSunCurve(sun);
}

function renderMoonCard(moon) {
    if (!moon) return;
    setMoonTimeEl(document.getElementById('moon-card-rise'), moon.rise);
    setMoonTimeEl(document.getElementById('moon-card-set'),  moon.set);
    // Phase name / illumination come from the live snapshot (phase drifts
    // continuously, see renderAstronomyLive).
}

// Returns the altitude to use for star visibility. When the user has pinned
// a static background preset, the actual sun altitude is irrelevant — a midday
// preset at night must not show stars, and a night preset at noon should show
// them. Dynamic mode always uses the real sun altitude.
function getStarAltitude(sunAltDeg) {
    const pref = loadBgPreference();
    if (pref.mode === 'static') return SKY_ANCHORS[pref.anchorIndex]?.alt ?? null;
    return sunAltDeg;
}

function renderAstronomyLive(sunSnapshot, moonSnapshot) {
    renderSkyBackground(sunSnapshot?.currentAltitude);
    updateStarField(getStarAltitude(sunSnapshot?.currentAltitude));

    if (moonSnapshot?.phase) {
        renderMoonPhase(
            moonSnapshot.phase,
            moonSnapshot.parallacticAngle ?? 0,
            moonAmbientFor(sunSnapshot?.currentAltitude),
        );
    }

    // Refresh the time-dependent bits every tick — countdown text and
    // sun-curve "now" marker both depend on Date.now().
    const sun = state.astronomyDaily?.sunDailyEvents;
    if (sun) {
        updateSunHero(sun.rise, sun.set, sun.dayLengthSeconds);
        updateSunNowMarker(sunSnapshot?.currentAltitude);
    }
    const moon = state.astronomyDaily?.moonDailyEvents;
    if (moon) updateMoonCountdown(moon.rise, moon.set, moonSnapshot?.currentAltitude);

    // Keep the open modal's live fields in sync on every poll tick.
    patchAstroModalLive();
}

function renderMoonPhase(phase, parallacticAngle = 0, ambient = null) {
    const canvas = document.getElementById('moon-canvas');
    const name   = document.getElementById('moon-phase-name');
    const pct    = document.getElementById('moon-phase-illum');
    if (!canvas || !name || !pct) return;

    const phaseDeg = phase.phaseDegrees ?? 0;
    drawMoon(canvas, phaseDeg, parallacticAngle, ambient);

    name.textContent = phase.phaseName ?? '--';
    pct.textContent  = (phase.illuminationPercent ?? 0).toFixed(0);
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

function renderHumidity(humidity, isMixedDew = false) {
    if (!humidity) return;

    const humVal = humidity.value;
    if (humVal != null) {
        document.getElementById('humidity-val').textContent = humVal;
    }

    const dewEl = document.getElementById('humidity-dew-val');
    if (dewEl) {
        dewEl.textContent = humidity.dewPoint != null
            ? `${isMixedDew ? '~' : ''}${humidity.dewPoint.toFixed(1)}°C`
            : '--°C';
    }

    renderDewPointStatus(humidity, isMixedDew);
}

function renderDewPointStatus(humidity, isMixedDew = false) {
    const spreadValEl = document.getElementById('dew-spread-val');
    const dewTEl      = document.getElementById('dew-t');
    const dewTdEl     = document.getElementById('dew-td');
    const badgeEl     = document.getElementById('dew-status');

    if (!spreadValEl) return;

    const dewPoint = humidity?.dewPoint;
    const risk     = humidity?.dewPointRisk;

    const tempText = document.getElementById('avg-temp')?.textContent;
    const temp     = tempText && tempText !== '--' ? parseFloat(tempText) : null;

    if (dewPoint == null || temp == null) {
        spreadValEl.textContent = '--°';
        return;
    }

    const spread = parseFloat((temp - dewPoint).toFixed(1));

    spreadValEl.textContent = `${isMixedDew ? '~' : ''}${spread.toFixed(1)}°`;
    if (dewTEl)  dewTEl.textContent  = temp.toFixed(1);
    if (dewTdEl) dewTdEl.textContent = dewPoint.toFixed(1);

    if (badgeEl && risk) {
        const config      = DEW_POINT_RISK_CONFIG[risk] ?? DEW_POINT_RISK_CONFIG.UNLIKELY;
        badgeEl.className = `dew-status-badge ${config.cssClass}`;
        // Wrap in a span so text-overflow:ellipsis works inside the flex container.
        badgeEl.innerHTML = `<span class="dew-badge-text">${config.label}</span>`;
        badgeEl._dewRisk  = risk;
        badgeEl._dewMixed = isMixedDew;
    }
}

// ==========================================
// SURFACE WETNESS BADGE (inside humidity card)
// ==========================================

function renderSurfaceWetness(wetness) {
    const badgeEl = document.getElementById('wetness-badge');
    const textEl  = document.getElementById('wetness-status-text');

    if (!badgeEl) return;

    badgeEl._wetnessData = wetness ?? null;

    const status = wetness?.surfaceWetnessStatus;

    if (!status) {
        badgeEl.className  = 'wetness-status-badge wetness-dry';
        textEl.textContent = '--';
        return;
    }

    const config = SURFACE_WETNESS_CONFIG[status] ?? SURFACE_WETNESS_CONFIG.DRY;
    badgeEl.className  = `wetness-status-badge ${config.cssClass}`;
    textEl.textContent = config.label;
}

// ==========================================
// WIND
// ==========================================

function renderWind(wind) {
    if (!wind) return;
    document.getElementById('wind-speed').textContent = wind.speed ?? '--';
    document.getElementById('wind-gusts').textContent = wind.gusts ?? '--';

    const arrowEl = document.getElementById('wind-direction-arrow');
    const labelEl = document.getElementById('wind-direction-label');
    const degEl   = document.getElementById('wind-direction-deg');

    if (wind.direction != null) {
        if (arrowEl) {
            arrowEl.textContent = '↑';
            arrowEl.style.transform = `rotate(${wind.direction}deg)`;
        }
        if (labelEl) labelEl.textContent = wind.directionLabel ?? '--';
        if (degEl)   degEl.textContent   = Math.round(wind.direction);
    } else {
        if (arrowEl) { arrowEl.textContent = '–'; arrowEl.style.transform = ''; }
        if (labelEl) labelEl.textContent = '--';
        if (degEl)   degEl.textContent   = '--';
    }
}

// ==========================================
// UV INDEX
// ==========================================

function renderUvIndex(uv) {
    const valEl   = document.getElementById('uv-val');
    const levelEl = document.getElementById('uv-level');
    if (!valEl) return;

    const value = uv?.value;
    valEl.textContent = value != null ? value.toFixed(1) : '--';

    if (levelEl) {
        const level = uv?.uvLevel ?? null;
        levelEl.textContent = level ? level.replace('_', ' ') : '--';
        levelEl.className   = `uv-level-badge ${UV_CSS[level] ?? ''}`;
    }
}

// ==========================================
// MAIN RENDER
// ==========================================

function renderMetrics(dto, dataStatus) {
    const temp     = dto?.temperature;
    const pressure = dto?.pressure;
    const humidity = dto?.humidity;
    const wetness  = dto?.surfaceWetness;
    const wind     = dto?.wind;
    const uv       = dto?.uvIndex;

    const isMixedDew = (temp?.dataDetails?.dataProvider ?? 'LOCAL_SENSOR')
                     !== (humidity?.dataDetails?.dataProvider ?? 'LOCAL_SENSOR');

    renderTemperature(temp);
    renderPressure(pressure);
    renderHumidity(humidity, isMixedDew);
    renderSurfaceWetness(wetness);
    renderWind(wind);
    renderUvIndex(uv);

    populatePopup('temperature-card', temp?.dataDetails,     dataStatus);
    populatePopup('pressure-card',    pressure?.dataDetails, dataStatus);
    populatePopup('humidity-card',    humidity?.dataDetails, dataStatus);
    populatePopup('wind-card',        wind?.metricDataDetails, dataStatus);
    populatePopup('uv-card',          uv?.dataDetails,       dataStatus);

    setStatusCircleColor(document.querySelector('#temperature-card .status-circle'), temp?.dataDetails?.quality,       dataStatus, temp?.dataDetails?.dataProvider);
    setStatusCircleColor(document.querySelector('#pressure-card .status-circle'),    pressure?.dataDetails?.quality,   dataStatus, pressure?.dataDetails?.dataProvider);
    setStatusCircleColor(document.querySelector('#humidity-card .status-circle'),    humidity?.dataDetails?.quality,   dataStatus, humidity?.dataDetails?.dataProvider);
    setStatusCircleColor(document.querySelector('#wind-card .status-circle'),        wind?.metricDataDetails?.quality, dataStatus, wind?.metricDataDetails?.dataProvider);
    setStatusCircleColor(document.querySelector('#uv-card .status-circle'),          uv?.dataDetails?.quality,         dataStatus, uv?.dataDetails?.dataProvider);

    updateStalenessHints(dataStatus, dto);
}

async function loadDaily() {
    try {
        const daily            = await fetchDashboardDaily();
        state.astronomyDaily   = daily;
        state.dailyKey         = daily.dailyKey;
        renderAstronomyDaily(daily);
        window.refreshCloudSunTimes?.(daily.sunDailyEvents?.rise, daily.sunDailyEvents?.set);
        // Race-condition guard: loadDaily() and the first updateLive() run
        // concurrently at boot. The live endpoint is usually faster, so
        // renderAstronomyLive() often runs before state.astronomyDaily is
        // set — skipping updateSunHero, updateSunNowMarker, and
        // updateMoonCountdown. Re-run the live render now that daily data
        // is in state so those fields populate immediately instead of
        // waiting for the next 30-second poll tick.
        if (state.sunSnapshot || state.moonSnapshot) {
            renderAstronomyLive(state.sunSnapshot, state.moonSnapshot);
        }
    } catch (error) {
        console.error('Daily dashboard load failed:', error);
    }
}

async function updateLive() {
    try {
        const live          = await fetchDashboardLive();
        state.metrics       = live.metrics;
        state.systemHealth  = live.systemHealth;
        state.sunSnapshot   = live.sunSnapshot;
        state.moonSnapshot  = live.moonSnapshot;

        // Re-fetch daily events on midnight rollover or runtime timezone change.
        if (state.dailyKey && live.dailyKey && live.dailyKey !== state.dailyKey) {
            await loadDaily();
        }

        renderMetrics(state.metrics, state.systemHealth?.status);
        renderSystemHealth(state.systemHealth);
        renderAstronomyLive(state.sunSnapshot, state.moonSnapshot);
    } catch (error) {
        console.error('Live dashboard update failed:', error);
    }
}

// ==========================================
// SYSTEM HEALTH
// ==========================================

// Formats a lag duration (minutes) for the System Health popover. Bare
// minute counts get unreadable once a sensor has been offline for a while
// (e.g. "38661 min"), so this steps up to hours/days once the count grows —
// same bucket style as formatTimeSince, but driven by a minute count
// directly rather than an ISO timestamp diffed against now.
function formatLagMinutes(minutes) {
    if (minutes == null) return '--';
    if (minutes < 60) return `${minutes} min`;

    const hours    = Math.floor(minutes / 60);
    const remMins  = minutes % 60;
    if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;

    const days     = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

// Sensor status becomes OFFLINE purely from data lag (see DataStatus.fromLag) —
// it doesn't know *why* data stopped arriving. Cross-reference the separate MQTT
// connection flag so the UI can say which one actually failed, instead of a bare
// "OFFLINE" that reads as ambiguous now that MQTT has its own status row.
function describeSensorStatus(systemHealth) {
    if (systemHealth.status !== 'OFFLINE') {
        return { popoverText: systemHealth.status, labelText: DATA_STATUS_INFO[systemHealth.status]?.label };
    }
    return systemHealth.mqttStatus
        ? { popoverText: 'OFFLINE', labelText: 'Sensors Offline' }
        : { popoverText: 'OFFLINE', labelText: 'MQTT Offline' };
}

function renderSystemHealth(systemHealth) {
    if (!systemHealth) return;

    const statusDetail = describeSensorStatus(systemHealth);

    document.getElementById('status').textContent       = statusDetail.popoverText;
    document.getElementById('lag').textContent          = formatLagMinutes(systemHealth.lagMinutes);
    document.getElementById('todayRecords').textContent = systemHealth.recordsToday;

    const lastUpdate = document.getElementById('lastUpdate');
    lastUpdate.textContent = systemHealth.lastMeasuredAt
        ? new Date(systemHealth.lastMeasuredAt).toLocaleTimeString('en-GB')
        : '--:--:--';

    const mqttStatusEl = document.getElementById('mqttStatus');
    if (mqttStatusEl) {
        mqttStatusEl.textContent = systemHealth.mqttStatus ? 'Connected' : 'Disconnected';
        mqttStatusEl.style.color = systemHealth.mqttStatus ? DATA_STATUS_COLORS.LIVE : DATA_STATUS_COLORS.OFFLINE;
    }

    const color = DATA_STATUS_COLORS[systemHealth.status] ?? '#6b7280';
    document.getElementById('status').style.color = color;

    // Drive the header status dot — color, glow, and pulse when live.
    const dot = document.getElementById('health-dot');
    if (dot) {
        dot.style.backgroundColor = color;
        dot.style.boxShadow = `0 0 7px 2px ${STATUS_DOT_GLOW[systemHealth.status] ?? 'rgba(107,114,128,0.4)'}`;
        dot.classList.toggle('pulsing', systemHealth.status === 'LIVE');
    }
    const label = document.getElementById('health-status-label');
    if (label) {
        label.textContent = statusDetail.labelText ?? '--';
        label.style.color = color;
    }
}

function initHealthPopover() {
    const btn     = document.getElementById('health-dot-btn');
    const popover = document.getElementById('health-popover');
    if (!btn || !popover) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const opening = !popover.classList.contains('open');
        if (opening) closeAllPopovers('health');
        popover.classList.toggle('open', opening);
        btn.setAttribute('aria-expanded', String(opening));
        popover.setAttribute('aria-hidden', String(!opening));

        if (opening) {
            // Position below the button, right-aligned to it.
            const rect = btn.getBoundingClientRect();
            popover.style.top   = `${rect.bottom + 6}px`;
            popover.style.right = `${window.innerWidth - rect.right}px`;
            popover.style.left  = 'auto';
        }
    });

    // Close on any outside click (piggyback the existing global handler).
    document.addEventListener('click', () => {
        if (popover.classList.contains('open')) {
            popover.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
            popover.setAttribute('aria-hidden', 'true');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popover.classList.contains('open')) {
            popover.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
            popover.setAttribute('aria-hidden', 'true');
            btn.focus();
        }
    });
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
    const metric   = state.currentMetric;
    const provider = state.metricProviders[metric] ?? 'LOCAL_SENSOR';
    const isApi    = provider === 'EXTERNAL_API';
    state.charts[metric] = [];
    const effectiveRes = isApi ? 60 : state.currentResolution;
    renderWeatherChart([], metric, effectiveRes, { apiMode: isApi });
    startChart(metric);
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
        // Re-apply the API lock on top of the mobile-resolution sync so the
        // disabled state is never lost after a viewport change.
        syncResolutionForProvider(state.metricProviders[state.currentMetric] ?? 'LOCAL_SENSOR');
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

        const knownProvider = state.metricProviders[value] ?? 'LOCAL_SENSOR';
        const isApi         = knownProvider === 'EXTERNAL_API';
        syncResolutionForProvider(knownProvider);

        if (!state.charts[value]) state.charts[value] = [];
        const effectiveRes = isApi ? 60 : state.currentResolution;
        renderWeatherChart(state.charts[value], value, effectiveRes, { apiMode: isApi });
        startChart(value);
    });
}

// ==========================================
// STALENESS HINTS
// ==========================================

// `dataStatus` is MQTT sensor lag — only ever shown on cards actually backed
// by the local sensor. API-backed cards get their own provider passed in and
// are skipped entirely, since sensor lag says nothing about Open-Meteo data.
function updateStalenessHints(dataStatus, dto) {
    const isStale = dataStatus && dataStatus !== 'LIVE';
    const HINT_TARGETS = [
        { selector: '#temperature-card .main-value', provider: dto?.temperature?.dataDetails?.dataProvider },
        { selector: '#pressure-card .main-value',    provider: dto?.pressure?.dataDetails?.dataProvider },
        { selector: '#humidity-card .main-value',    provider: dto?.humidity?.dataDetails?.dataProvider },
        { selector: '#wind-card .main-value',         provider: dto?.wind?.metricDataDetails?.dataProvider },
        { selector: '#uv-card .main-value',           provider: dto?.uvIndex?.dataDetails?.dataProvider },
    ];
    const HINT_LABELS = { DELAYED: '~ delayed', STALE: '~ stale', OFFLINE: '~ offline', EMPTY: '~ no data' };
    const HINT_COLORS = { DELAYED: '#fcd34d',   STALE: '#f97316',  OFFLINE: '#ef4444',   EMPTY: '#6b7280'   };

    HINT_TARGETS.forEach(({ selector, provider }) => {
        const target = document.querySelector(selector);
        if (!target) return;
        const parent = target.parentElement;
        let hint = parent.querySelector('.data-stale-hint');
        if (isStale && provider !== 'EXTERNAL_API') {
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
initMetricPopovers();
// The modal re-reads `state` on every render, so it always reflects the
// latest poll without the dashboard pushing updates into it.
initAstroModal(() => state);
initHealthPopover();
initBgPreference({
    getSunAltitude: () => state.sunSnapshot?.currentAltitude,
    // Stars and the moon disk both key off the sky, so they have to be
    // re-rendered the moment the preference changes rather than waiting for
    // the next 30 s poll.
    onApplied: () => {
        updateStarField(getStarAltitude(state.sunSnapshot?.currentAltitude));
        if (state.moonSnapshot?.phase) {
            renderMoonPhase(
                state.moonSnapshot.phase,
                state.moonSnapshot.parallacticAngle ?? 0,
                moonAmbientFor(state.sunSnapshot?.currentAltitude),
            );
        }
    },
});
initStarField();
window.setStarFieldModalDim = setStarFieldModalDim;
loadDaily();
startPolling(updateLive, 30000);