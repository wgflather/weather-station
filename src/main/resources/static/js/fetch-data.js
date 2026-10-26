import { renderWeatherChart } from './weather-chart.js';
import { FetchScheduler } from './FetchScheduler.js';
import { initStarField, updateStarField, setStarFieldModalDim } from './star-field.js';
import { drawMoon } from './moon-canvas.js';
import { initAstroModal, refreshAstroModal, patchAstroModalLive } from './astro-modal.js';
import { initMetricPopovers } from './metric-popovers.js';
import { renderMetrics } from './metric-cards.js';
import { renderSystemHealth, renderConnection, initHealthPopover } from './system-health.js';
import {
    renderSunCurve,
    updateSunNowMarker,
    updateSunHero,
    updateMoonCountdown,
} from './sun-curve.js';
import {
    renderSkyBackground,
    moonAmbientFor,
    getStarAltitude,
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

// A request the server never answers would otherwise hold the link in
// 'syncing' indefinitely, so it is bounded and counts as a failure.
const LIVE_TIMEOUT_MS = 10000;

async function fetchDashboardLive() {
    const response = await fetch('/api/weather/dashboard/live', {
        signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error('Live dashboard fetch failed');
    return await response.json();
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
        updateSunHero(sun.rise, sun.set, sun.dayLengthSeconds, sunSnapshot?.currentAltitude);
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

// ==========================================
// LINK STATE
// ==========================================

// Whether what is on screen is current, as distinct from the server's own
// LIVE/STALE verdict — which describes the sensor, and goes on saying LIVE
// after the server itself has stopped answering. Measured on the client's
// clock from the last live poll that succeeded.
//
// Two missed 30 s polls plus slack: one slow response must not flicker it.
const LINK_STALE_MS = 75000;

const link = { lastOkAt: null, failing: false, inFlight: false };

function linkState() {
    const recent = link.lastOkAt && Date.now() - link.lastOkAt < LINK_STALE_MS;
    if (recent && !link.failing) return 'ok';
    // Nothing recent: while a request is out the page may be about to catch
    // up (boot, or a resume), so it reads as updating rather than lost.
    if (link.inFlight) return 'syncing';
    return 'lost';
}

function refreshLink() {
    renderConnection(linkState(), link.lastOkAt);
}

async function updateLive() {
    link.inFlight = true;
    refreshLink();
    try {
        const live          = await fetchDashboardLive();
        state.metrics       = live.metrics;
        state.systemHealth  = live.systemHealth;
        state.sunSnapshot   = live.sunSnapshot;
        state.moonSnapshot  = live.moonSnapshot;
        link.lastOkAt       = Date.now();
        link.failing        = false;

        // Re-fetch daily events on midnight rollover or runtime timezone
        // change — or when the boot-time load failed because the server was
        // down, which would otherwise leave the sun and moon cards empty.
        if (!state.astronomyDaily
            || (state.dailyKey && live.dailyKey && live.dailyKey !== state.dailyKey)) {
            await loadDaily();
        }

        renderMetrics(state.metrics, state.systemHealth?.status);
        renderSystemHealth(state.systemHealth);
        renderAstronomyLive(state.sunSnapshot, state.moonSnapshot);
    } catch (error) {
        link.failing = true;
        console.error('Live dashboard update failed:', error);
    } finally {
        link.inFlight = false;
        refreshLink();
    }
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
// POLLING
// ==========================================

// Reschedules from a `finally` so a rejection can never end the loop. The
// callers catch their own errors today, but a single throw escaping one of
// them would otherwise stop every future poll — freezing the dashboard on
// stale values with nothing on screen to say updates had stopped.
//
// Returns a function that runs the poll now and restarts the interval from
// there. A call while a run is in flight is absorbed by that run.
function startPolling(fn, interval) {
    let timer   = null;
    let running = false;
    async function loop() {
        if (running) return;
        clearTimeout(timer);
        running = true;
        try {
            await fn();
        } catch (error) {
            console.error('Poll failed:', error);
        } finally {
            running = false;
            timer = setTimeout(loop, interval);
        }
    }
    loop();
    return loop;
}

// A backgrounded tab or a home-screen app has its timers frozen, so on return
// the page shows whatever it last held — readings and chart hours old under a
// clock that is current — until the next timer fires, which for the chart can
// be a whole bucket away. Coming back is therefore a trigger in its own right
// (the same set cloud-forecast.js listens to). The link is re-judged first, so
// the stale page is marked as such in the frame before the requests return.
function initResumeRefresh(pollLiveNow) {
    const resume = () => {
        refreshLink();
        if (linkState() === 'ok') return;
        pollLiveNow();
        startChart(state.currentMetric);
    };
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') resume();
    });
    window.addEventListener('pageshow', (e) => { if (e.persisted) resume(); });
    window.addEventListener('online', resume);
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
const pollLiveNow = startPolling(updateLive, 30000);
initResumeRefresh(pollLiveNow);
// Re-judges the link between polls, so a server that stops answering is shown
// within LINK_STALE_MS rather than whenever a request next happens to settle,
// and keeps the popover's "last contact" age moving.
setInterval(refreshLink, 5000);