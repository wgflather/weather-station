import { renderWeatherChart } from './weather-chart.js';
import { FetchScheduler } from './FetchScheduler.js';
import { initStarField, updateStarField, setStarFieldModalDim } from './star-field.js';
import { drawMoon } from './moon-canvas.js';
import {
    renderSunModalChart,
    updateSunModalChartLive,
    destroySunModalChart,
    getCurrentTwilightPhase,
} from './sun-modal-chart.js';
import { SKY_ANCHORS, lerpTriplet, skyBottomRgbAt } from './sky-colors.js';

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
    openModal:         null,   // 'sun' | 'moon' | null — which detail modal is open
    modalReturnFocus:  null,   // element to restore focus to when modal closes
    scrollLockY:       null,   // scroll position frozen while modal is open
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
    SATURATED:   { label: 'Condensation Imminent', cssClass: 'risk-saturated' },
    VERY_LIKELY: { label: 'Condensation Likely',   cssClass: 'risk-likely'    },
    POSSIBLE:    { label: 'Condensation Possible', cssClass: 'risk-possible'  },
    UNLIKELY:    { label: 'Condensation Unlikely', cssClass: 'risk-unlikely'  },
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


function formatTimeOfDay(isoString) {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return isNaN(date.getTime())
        ? '--:--'
        : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// Full date-aware label for the modal where space is not a constraint.
function formatMoonEvent(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '—';
    const timeStr  = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const today    = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (date.toDateString() === today.toDateString())    return timeStr;
    if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow ${timeStr}`;
    return `${date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })} ${timeStr}`;
}

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

function formatDuration(totalSeconds) {
    if (totalSeconds == null) return '--';
    const seconds = Math.abs(totalSeconds);
    const hours   = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function renderAstronomyDaily(daily) {
    if (!daily) return;
    renderSunCard(daily.sunDailyEvents);
    renderMoonCard(daily.moonDailyEvents);
    // If a modal is open while daily refreshes (midnight rollover or
    // zone change), keep its contents in sync.
    if (state.openModal) renderActiveModal();
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
    if (moon) updateMoonCountdown(moon.rise, moon.set);

    // Keep the open modal's live fields in sync on every poll tick.
    if (state.openModal) patchActiveModalLive();
}

// ==========================================
// SUN CURVE + HERO
// ==========================================

// SVG viewBox dimensions for the daily-arc curve. preserveAspectRatio is
// 'none' on the element so width stretches with the card while height
// stays at 70px. Marker / label positioning uses these same logical
// units (HORIZON_Y_VB is in viewBox y, but since the SVG is 70px tall
// with a 70-unit-tall viewBox, the y values double as pixel offsets
// inside the wrapper).
const CURVE_W_VB = 300;
const CURVE_H_VB = 70;
// Horizon sits 60% down so the daytime arc gets ~1.5× the vertical room
// of the night dip — matches what people expect (day is the part that
// matters; the trough below is context).
const CURVE_HORIZON_Y = 42;
const CURVE_ABOVE_PADDING = 0.88;
// Below-horizon depth is intentionally shallow (0.25) so the trough reads
// as a gentle suggestion of nighttime rather than a sharp V-shape.
const CURVE_BELOW_PADDING = 0.25;

// Scale memoised from the daily render so the per-tick "now" marker
// reposition doesn't rescan the points list.
let sunCurveScale = null;

function altitudeToY(altDeg, maxAlt, minAlt) {
    if (altDeg >= 0) {
        return CURVE_HORIZON_Y - (altDeg / maxAlt) * CURVE_HORIZON_Y * CURVE_ABOVE_PADDING;
    }
    const belowSpace = CURVE_H_VB - CURVE_HORIZON_Y;
    return CURVE_HORIZON_Y + (Math.abs(altDeg) / Math.abs(minAlt)) * belowSpace * CURVE_BELOW_PADDING;
}

function timeToXPercent(isoTime, startMs, endMs) {
    const ms = new Date(isoTime).getTime();
    return Math.max(0, Math.min(100, ((ms - startMs) / (endMs - startMs)) * 100));
}

function renderSunCurve(sun) {
    const svg = document.getElementById('sun-curve');
    const points = sun.sunCurve;
    if (!svg || !points || !points.length) return;

    let maxAlt = 0, minAlt = 0;
    for (const p of points) {
        if (p.altitude > maxAlt) maxAlt = p.altitude;
        if (p.altitude < minAlt) minAlt = p.altitude;
    }
    // Guard against degenerate (polar-day / polar-night) curves where the
    // body stays one side of the horizon — keep a minimum range so the
    // scale doesn't collapse to a div-by-zero.
    maxAlt = Math.max(maxAlt, 1);
    minAlt = Math.min(minAlt, -1);

    const startMs = new Date(points[0].time).getTime();
    const endMs   = new Date(points[points.length - 1].time).getTime();

    sunCurveScale = { maxAlt, minAlt, startMs, endMs };

    // Path is sampled every ~10 minutes (embedded curve is 1-min
    // resolution; ~144 segments draw a smooth arc at card size without
    // shipping ~1.4k path commands).
    const N = points.length;
    const step = Math.max(1, Math.floor(N / 144));
    let pathD = '';
    for (let i = 0; i < N; i += step) {
        const x = (i / (N - 1)) * CURVE_W_VB;
        const y = altitudeToY(points[i].altitude, maxAlt, minAlt);
        pathD += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1);
    }
    pathD += 'L' + CURVE_W_VB + ',' + altitudeToY(points[N - 1].altitude, maxAlt, minAlt).toFixed(1);
    svg.querySelector('.astro-curve-path').setAttribute('d', pathD);

    // Rise / noon / set markers + their time labels. The viewBox y range
    // [0, 70] equals the SVG's rendered pixel height, so altitudeToY's
    // output doubles as a top offset in pixels relative to the wrapper.
    placeSunMarker('sun-marker-rise', 'sun-label-rise', sun.rise, 0);
    placeSunMarker('sun-marker-set',  'sun-label-set',  sun.set,  0);
    placeSunMarker(
        'sun-marker-noon',
        'sun-label-noon',
        sun.solarNoon?.time,
        sun.solarNoon?.alt ?? maxAlt,
    );
}

// Gap between the bottom edge of a marker dot and the top of its label.
const LABEL_OFFSET_PX = 12;

function placeSunMarker(markerId, labelId, isoTime, altitudeDeg) {
    const marker = document.getElementById(markerId);
    const label  = document.getElementById(labelId);
    if (!marker || !label || !sunCurveScale) return;

    if (!isoTime) {
        marker.style.display = 'none';
        label.style.display  = 'none';
        return;
    }

    const { maxAlt, minAlt, startMs, endMs } = sunCurveScale;
    const xPercent = timeToXPercent(isoTime, startMs, endMs);
    const yPx = altitudeToY(altitudeDeg, maxAlt, minAlt);

    marker.style.display = '';
    marker.style.left = `${xPercent}%`;
    marker.style.top  = `${yPx}px`;

    // Label sits LABEL_OFFSET_PX below the marker's centre. The tick
    // ::before pseudo-element bridges the gap visually.
    label.style.display = '';
    label.textContent   = formatTimeOfDay(isoTime);
    label.style.left    = `${xPercent}%`;
    label.style.top     = `${yPx + LABEL_OFFSET_PX}px`;
}

function updateSunNowMarker(currentAltitude) {
    const el = document.getElementById('sun-marker-now');
    if (!el) return;
    if (!sunCurveScale || currentAltitude == null) {
        el.style.display = 'none';
        return;
    }
    const { maxAlt, minAlt, startMs, endMs } = sunCurveScale;
    const t = Math.max(0, Math.min(1, (Date.now() - startMs) / (endMs - startMs)));
    el.style.display = '';
    el.style.left = `${(t * 100).toFixed(2)}%`;
    el.style.top  = `${altitudeToY(currentAltitude, maxAlt, minAlt)}px`;
}

// ==========================================
// COUNTDOWN HELPERS (shared by sun + moon)
// ==========================================

// Picks the next horizon-crossing event today and returns { label,
// timeMs } or null when no future event remains in today's data (the
// tail end of the day — tomorrow's rise isn't on this payload).
function pickNextEvent(riseIso, setIso, bodyLabel) {
    const now = Date.now();
    const candidates = [
        { label: `${bodyLabel}rise`, timeMs: riseIso ? new Date(riseIso).getTime() : null },
        { label: `${bodyLabel}set`,  timeMs: setIso  ? new Date(setIso).getTime()  : null },
    ].filter(e => e.timeMs != null && e.timeMs > now);
    candidates.sort((a, b) => a.timeMs - b.timeMs);
    return candidates[0] ?? null;
}

function formatCountdown(targetMs) {
    const diffSec = Math.max(0, Math.floor((targetMs - Date.now()) / 1000));
    const hours = Math.floor(diffSec / 3600);
    const minutes = Math.floor((diffSec % 3600) / 60);
    if (hours === 0) return `${minutes}m`;
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

function clockText(ms) {
    return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function updateSunHero(riseIso, setIso, dayLengthSeconds) {
    const eventEl = document.getElementById('sun-hero-event');
    const timeEl  = document.getElementById('sun-sub-time');
    const dayEl   = document.getElementById('sun-sub-day');
    if (!eventEl || !timeEl || !dayEl) return;

    const dayText = `Day ${formatDuration(dayLengthSeconds)}`;
    const next = pickNextEvent(riseIso, setIso, 'Sun');
    if (next) {
        eventEl.textContent = `${next.label} in ${formatCountdown(next.timeMs)}`;
        timeEl.textContent  = `${clockText(next.timeMs)} · `;
        dayEl.textContent   = dayText;
    } else {
        eventEl.textContent = 'Below horizon';
        timeEl.textContent  = '';
        dayEl.textContent   = dayText;
    }
}

function updateMoonCountdown(riseIso, setIso) {
    const el = document.getElementById('moon-hero-event');
    if (!el) return;
    const next = pickNextEvent(riseIso, setIso, 'Moon');
    if (next) {
        el.textContent = `${next.label} in ${formatCountdown(next.timeMs)}`;
    } else if (riseIso == null && setIso == null) {
        const alt = state.moonSnapshot?.currentAltitude ?? 0;
        el.textContent = alt > 0 ? 'Above horizon all day' : 'Below horizon all day';
    } else {
        el.textContent = 'Below horizon';
    }
}

// ==========================================
// DYNAMIC SKY BACKGROUND & CARD COLORS
// ==========================================
//
// SKY_ANCHORS (imported from sky-colors.js, shared with the sun modal
// chart's curve): for a given sun altitude, the top/bottom sky gradient
// colors plus the card surface and accent (border + divider) colors. The
// current altitude is linearly interpolated between bracketing anchors and
// the results are written into CSS custom properties; @property + a 12s
// transition do the smooth animation between values.
//
// Card colors stay cool/blue across all phases so light text remains
// readable; they shift just enough in brightness and saturation to
// harmonise with the sky rather than fight it. The +30° anchor matches
// the original static palette so the daytime "baseline" is unchanged.

// Alpha channels for card surface and accent.
const CARD_BG_ALPHA           = 0.46;
const CARD_BORDER_ALPHA       = 0.12;
const DIVIDER_ALPHA           = 0.10;
// Stronger variants for elements that sit above the page (modal panel, hover).
const CARD_BG_STRONG_ALPHA     = 0.85;
const CARD_BORDER_STRONG_ALPHA = 0.18;
// Sky-ambient outer glow: desaturated sky bottom at very low alpha as a
// barely-perceptible outer box-shadow on cards — environmental hue, not glow.
const SKY_AMBIENT_ALPHA        = 0.10;

function rgbString([r, g, b])          { return `rgb(${r}, ${g}, ${b})`; }
function rgbaString([r, g, b], alpha)  { return `rgba(${r}, ${g}, ${b}, ${alpha})`; }
function rgbHex([r, g, b])             { return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join(''); }

// Shifts a color toward its own perceptual luminance (neutral grey), reducing
// saturation without changing perceived brightness. ratio=0: unchanged;
// ratio=1: fully grey. Used to normalize warm sunset colors so the ambient
// glow doesn't appear significantly brighter than cool-sky versions.
function desaturateColor([r, g, b], ratio) {
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return [
        Math.round(r + (luma - r) * ratio),
        Math.round(g + (luma - g) * ratio),
        Math.round(b + (luma - b) * ratio),
    ];
}

function buildSkyState(lo, hi, t) {
    const topRgb    = lerpTriplet(lo.top,     hi.top,     t);
    const bottomRgb = lerpTriplet(lo.bottom,  hi.bottom,  t);
    const cardBgRgb = lerpTriplet(lo.cardBg,  hi.cardBg,  t);
    const accRgb    = lerpTriplet(lo.cardAcc, hi.cardAcc, t);
    const skyRgbArr = lerpTriplet(lo.skyRgb,  hi.skyRgb,  t);

    // Desaturate ambient colors before use: warm sunset oranges and yellows
    // are perceptually much brighter than cool blues at the same luminance.
    // Shifting each color 55% toward its own luma (neutral grey) normalizes
    // perceived brightness across all sky states while preserving temperature
    // direction (warm vs cool remains distinguishable).
    const ambientRgb = desaturateColor(bottomRgb, 0.55);
    const accentRgb  = desaturateColor(skyRgbArr, 0.40);

    return {
        top:              rgbString(topRgb),
        bottom:           rgbString(bottomRgb),
        cardBg:           rgbaString(cardBgRgb, CARD_BG_ALPHA),
        cardBorder:       rgbaString(accRgb,    CARD_BORDER_ALPHA),
        divider:          rgbaString(accRgb,    DIVIDER_ALPHA),
        cardBgStrong:     rgbaString(cardBgRgb, CARD_BG_STRONG_ALPHA),
        cardBorderStrong: rgbaString(accRgb,    CARD_BORDER_STRONG_ALPHA),
        // Desaturated bottom-sky at low alpha as outer box-shadow on cards.
        // Retains warm/cool temperature direction without the brightness
        // spike that raw orange/yellow would create at golden hour.
        skyAmbient:       rgbaString(ambientRgb, SKY_AMBIENT_ALPHA),
        // Desaturated sky-RGB triplet for CSS rgba() accent usage.
        skyRgb:           accentRgb.join(', '),
        topHex:           rgbHex(topRgb),
        bottomHex:        rgbHex(bottomRgb),
    };
}

// iOS Safari caches the <meta name="theme-color"> value from initial page
// load and ignores subsequent `setAttribute('content', ...)` updates — the
// URL bar (and the bottom liquid-glass toolbar it feeds) keeps the old tint
// until a navigation forces a re-read. The workaround is to replace the
// element entirely each tick, which Safari treats as a fresh signal.
//
// On Chrome / Edge / Android Chrome, in-place mutation does work — but
// replacing the element works too, and the cost is one DOM op every 30s.
function setBrowserChromeColor(hex) {
    const old = document.head.querySelector('meta[name="theme-color"]');
    if (old && old.getAttribute('content') === hex) return;
    const fresh = document.createElement('meta');
    fresh.setAttribute('name', 'theme-color');
    fresh.setAttribute('content', hex);
    if (old) {
        old.replaceWith(fresh);
    } else {
        document.head.appendChild(fresh);
    }
}

function computeSkyColors(altitudeDeg) {
    if (altitudeDeg == null) return null;

    const first = SKY_ANCHORS[0];
    const last  = SKY_ANCHORS[SKY_ANCHORS.length - 1];

    if (altitudeDeg <= first.alt) return buildSkyState(first, first, 0);
    if (altitudeDeg >= last.alt)  return buildSkyState(last,  last,  0);

    for (let i = 0; i < SKY_ANCHORS.length - 1; i++) {
        const lo = SKY_ANCHORS[i];
        const hi = SKY_ANCHORS[i + 1];
        if (altitudeDeg >= lo.alt && altitudeDeg <= hi.alt) {
            const t = (altitudeDeg - lo.alt) / (hi.alt - lo.alt);
            return buildSkyState(lo, hi, t);
        }
    }
    return null;
}

// Normalized sky brightness from sun altitude: 0 = night, 0.5 = twilight,
// 1 = bright daytime. Smoothstepped so the moon's daytime adaptation eases in
// rather than snapping. Mirrors the perceptual reality that the moon only
// washes out once the sun is genuinely up — civil twilight and below read dark.
function skyBrightnessForAltitude(altitudeDeg) {
    if (altitudeDeg == null) return 0;
    const smooth = (t) => { const c = Math.max(0, Math.min(1, t)); return c * c * (3 - 2 * c); };
    if (altitudeDeg <= -6) return 0;            // civil twilight and below: dark
    if (altitudeDeg >= 12) return 1;            // sun well up: full daylight
    if (altitudeDeg <= 0) return 0.5 * smooth((altitudeDeg + 6) / 6);       // -6°→0° : 0 → 0.5
    return 0.5 + 0.5 * smooth(altitudeDeg / 12);                            // 0°→12° : 0.5 → 1
}

// Sky adaptation passed to drawMoon. Uses the *effective* altitude (the same one
// that drives star visibility) so a pinned static background preset washes the
// moon to match the displayed sky rather than the real sun position.
function moonAmbientFor(sunAltDeg) {
    const effAlt = getStarAltitude(sunAltDeg);
    return {
        brightness: skyBrightnessForAltitude(effAlt),
        skyTint:    skyBottomRgbAt(effAlt),
    };
}

let skyBackgroundPrimed = false;

// Shared DOM-writer used by both the dynamic renderer and the static
// background preference. `snap` bypasses the 12s CSS transition so the
// switch is instantaneous rather than a 12-second crawl to the new colour.
function applySkyColors(colors, snap = false) {
    if (!colors) return;
    const root = document.documentElement;
    if (snap) root.style.transition = 'none';

    root.style.setProperty('--bg-grad-top',        colors.top);
    root.style.setProperty('--bg-grad-bottom',     colors.bottom);
    root.style.setProperty('--card-bg',            colors.cardBg);
    root.style.setProperty('--card-border',        colors.cardBorder);
    root.style.setProperty('--divider',            colors.divider);
    root.style.setProperty('--card-bg-strong',     colors.cardBgStrong);
    root.style.setProperty('--card-border-strong', colors.cardBorderStrong);
    root.style.setProperty('--sky-ambient',        colors.skyAmbient);
    root.style.setProperty('--sky-rgb',            colors.skyRgb);

    if (snap) { void root.offsetWidth; root.style.transition = ''; }
    skyBackgroundPrimed = true;

    setBrowserChromeColor(colors.topHex);
    try {
        localStorage.setItem('skyColors', JSON.stringify({
            version: '2', top: colors.top, bottom: colors.bottom,
            cardBg: colors.cardBg, cardBorder: colors.cardBorder,
            divider: colors.divider, cardBgStrong: colors.cardBgStrong,
            cardBorderStrong: colors.cardBorderStrong, skyAmbient: colors.skyAmbient,
            skyRgb: colors.skyRgb, topHex: colors.topHex, bottomHex: colors.bottomHex,
        }));
    } catch (e) { /* private mode / quota */ }
}

function renderSkyBackground(sunAltitudeDeg) {
    if (loadBgPreference().mode === 'static') return;
    const colors = computeSkyColors(sunAltitudeDeg);
    if (!colors) return;
    applySkyColors(colors, !skyBackgroundPrimed);
}

// ==========================================
// ==========================================
// BACKGROUND PREFERENCE
// ==========================================

const PRESET_ANCHORS = [
    { label: 'Night',    idx: 0 },
    { label: 'Twilight', idx: 2 },
    { label: 'Sunset',   idx: 3 },
    { label: 'Golden',   idx: 4 },
    { label: 'Morning',  idx: 5 },
    { label: 'Midday',   idx: 6 },
];

function loadBgPreference() {
    try { return JSON.parse(localStorage.getItem('bgPreference') || 'null') ?? { mode: 'dynamic' }; }
    catch { return { mode: 'dynamic' }; }
}

function saveBgPreference(pref) {
    try { localStorage.setItem('bgPreference', JSON.stringify(pref)); } catch {}
}

function applyBgPreference(pref) {
    saveBgPreference(pref);
    if (pref.mode === 'static') {
        const a = SKY_ANCHORS[pref.anchorIndex];
        applySkyColors(buildSkyState(a, a, 0), true);
    } else {
        // Snap back to the current sun altitude so the transition is instant.
        skyBackgroundPrimed = false;
        const alt = state.sunSnapshot?.currentAltitude;
        if (alt != null) renderSkyBackground(alt);
    }
    // Star visibility must also reflect the new preference immediately.
    // getStarAltitude reads the just-saved pref via loadBgPreference().
    updateStarField(getStarAltitude(state.sunSnapshot?.currentAltitude));
    // Moon appearance (brightness, sky tint, glow) depends on the ambient sky,
    // so re-render immediately rather than waiting for the next 30s poll.
    if (state.moonSnapshot?.phase) {
        renderMoonPhase(
            state.moonSnapshot.phase,
            state.moonSnapshot.parallacticAngle ?? 0,
            moonAmbientFor(state.sunSnapshot?.currentAltitude),
        );
    }
}

function updateSwatchActive(pref) {
    document.querySelectorAll('.bg-swatch').forEach(el => {
        const active = pref.mode === el.dataset.mode &&
            (pref.mode === 'dynamic' || String(pref.anchorIndex) === el.dataset.anchor);
        el.classList.toggle('active', active);
    });
}

function initBgPreference() {
    // Apply saved static preference before the first astronomy poll arrives.
    const pref = loadBgPreference();
    if (pref.mode === 'static' && pref.anchorIndex != null) {
        const a = SKY_ANCHORS[pref.anchorIndex];
        applySkyColors(buildSkyState(a, a, 0), true);
    }

    const swatchesEl = document.getElementById('bg-pref-swatches');
    if (!swatchesEl) return;

    // Dynamic option (full-width horizontal row)
    let html = `<div class="bg-swatch" data-mode="dynamic" title="Changes with sun position">
        <div class="bg-swatch-circle bg-swatch-dynamic-circle"></div>
        <span class="bg-swatch-label">Dynamic — follows sun</span>
    </div><div class="bg-preset-grid">`;

    for (const preset of PRESET_ANCHORS) {
        const a   = SKY_ANCHORS[preset.idx];
        const top = `rgb(${a.top[0]},${a.top[1]},${a.top[2]})`;
        const bot = `rgb(${a.bottom[0]},${a.bottom[1]},${a.bottom[2]})`;
        html += `<div class="bg-swatch" data-mode="static" data-anchor="${preset.idx}" title="${preset.label}">
            <div class="bg-swatch-circle" style="background:linear-gradient(to bottom,${top},${bot})"></div>
            <span class="bg-swatch-label">${preset.label}</span>
        </div>`;
    }
    html += '</div>';

    swatchesEl.innerHTML = html;
    updateSwatchActive(pref);

    swatchesEl.addEventListener('click', e => {
        const swatch = e.target.closest('.bg-swatch');
        if (!swatch) return;
        const newPref = swatch.dataset.mode === 'static'
            ? { mode: 'static', anchorIndex: Number(swatch.dataset.anchor) }
            : { mode: 'dynamic' };
        applyBgPreference(newPref);
        updateSwatchActive(newPref);
    });

    const btn     = document.getElementById('bg-pref-btn');
    const popover = document.getElementById('bg-pref-popover');
    if (!btn || !popover) return;

    btn.addEventListener('click', e => {
        e.stopPropagation();
        const opening = !popover.classList.contains('open');
        popover.classList.toggle('open', opening);
        btn.setAttribute('aria-expanded', String(opening));
        popover.setAttribute('aria-hidden', String(!opening));
        if (opening) {
            const rect = btn.getBoundingClientRect();
            popover.style.top   = `${rect.bottom + 6}px`;
            popover.style.right = `${window.innerWidth - rect.right}px`;
            popover.style.left  = 'auto';
        }
    });

    document.addEventListener('click', () => {
        if (popover.classList.contains('open')) {
            popover.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
            popover.setAttribute('aria-hidden', 'true');
        }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && popover.classList.contains('open')) {
            popover.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
            popover.setAttribute('aria-hidden', 'true');
            btn.focus();
        }
    });
}

// ASTRONOMY MODAL
// ==========================================

// Compact twilight ladder rows: one row per band, dawn and dusk crossings
// side by side. Brightest band first, mirroring the chart's gradient.
const TWILIGHT_PAIRS = [
    { band: 'daylight',     label: 'Daylight',     dawn: 'sunrise',              dusk: 'sunset'                 },
    { band: 'civil',        label: 'Civil',        dawn: 'civilDawn',            dusk: 'civilDusk'              },
    { band: 'nautical',     label: 'Nautical',     dawn: 'nauticalDawn',         dusk: 'nauticalDusk'           },
    { band: 'astronomical', label: 'Astronomical', dawn: 'astronomicalNightEnd', dusk: 'astronomicalNightStart' },
];

function openAstroModal(which, trigger) {
    state.openModal        = which;
    state.modalReturnFocus = trigger ?? null;

    const modal = document.getElementById('astro-modal');
    document.getElementById('astro-modal-title').textContent =
        which === 'sun' ? 'Sun details' : 'Moon details';

    renderActiveModal();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    lockBodyScroll();
    setStarFieldModalDim(true);

    // Focus the close button so keyboard users land somewhere sensible.
    modal.querySelector('.astro-modal-close')?.focus();
}

function closeAstroModal() {
    if (!state.openModal) return;
    destroySunModalChart();
    const modal = document.getElementById('astro-modal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    unlockBodyScroll();
    setStarFieldModalDim(false);
    state.openModal = null;
    state.modalReturnFocus?.focus?.();
    state.modalReturnFocus = null;
}

// iOS Safari + Android Chrome ignore `overflow: hidden` on <body> for touch
// scrolling, so the page underneath would still scroll while the modal is
// open — that's what produces the flicker (the URL bar collapses, the
// viewport reflows, the fixed backdrop appears to jump). The reliable fix
// is to pin <body> to a fixed position offset by the current scroll, then
// restore the offset on close so the user lands back where they were.
function lockBodyScroll() {
    if (state.scrollLockY != null) return;
    const scrollY = window.scrollY;
    state.scrollLockY = scrollY;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top      = `-${scrollY}px`;
    body.style.left     = '0';
    body.style.right    = '0';
    body.style.width    = '100%';
}

function unlockBodyScroll() {
    if (state.scrollLockY == null) return;
    const y = state.scrollLockY;
    const body = document.body;
    body.style.position = '';
    body.style.top      = '';
    body.style.left     = '';
    body.style.right    = '';
    body.style.width    = '';
    window.scrollTo(0, y);
    state.scrollLockY = null;
}

// Full modal (re)build. Runs on open and on daily rollover / zone change —
// NOT on the 30-second poll tick (see patchActiveModalLive), so the sun
// chart's SVG survives ticks and scrubbing is never interrupted.
function renderActiveModal() {
    const body = document.getElementById('astro-modal-body');
    if (!body) return;
    if (state.openModal === 'sun') {
        destroySunModalChart();
        body.innerHTML = buildSunModalHTML();
        updateTwilightNowHighlight();
        // Chart container is now in the DOM — render on the next frame so
        // CSS layout has resolved and clientWidth/Height are non-zero.
        requestAnimationFrame(() => {
            const el = document.getElementById('sun-modal-chart');
            if (!el || state.openModal !== 'sun') return;
            renderSunModalChart(el, {
                sun: state.astronomyDaily?.sunDailyEvents,
                currentAltitude: state.sunSnapshot?.currentAltitude,
                dailyKey: state.dailyKey,
            });
        });
    }
    if (state.openModal === 'moon') {
        body.innerHTML = buildMoonModalHTML();
        // Canvas is now in the DOM — draw into it on the next frame so CSS
        // layout has resolved and offsetWidth/Height are non-zero.
        requestAnimationFrame(() => {
            const canvas = document.getElementById('moon-modal-canvas');
            if (!canvas) return;
            const snap = state.moonSnapshot;
            drawMoon(canvas, snap?.phase?.phaseDegrees ?? 0, snap?.parallacticAngle ?? 0);
        });
    }
}

// Cheap per-poll-tick refresh of the open modal. The moon modal is plain
// text/canvas, so a full rebuild stays fine; the sun modal only patches its
// live bits to keep the chart's DOM (and any in-flight scrub) intact.
function patchActiveModalLive() {
    if (state.openModal === 'moon') {
        renderActiveModal();
        return;
    }
    if (state.openModal === 'sun') {
        updateSunModalChartLive(state.sunSnapshot?.currentAltitude);
        updateTwilightNowHighlight();
    }
}

// Marks the twilight ladder cell (or row, for daylight) matching the phase
// the clock is in right now.
function updateTwilightNowHighlight() {
    const ladder = document.querySelector('#astro-modal-body .twilight-compact');
    if (!ladder) return;
    ladder.querySelectorAll('.is-now').forEach((el) => el.classList.remove('is-now'));

    const phase = getCurrentTwilightPhase(state.astronomyDaily?.sunDailyEvents?.times);
    if (!phase || phase.band === 'night') return;
    const target = phase.side
        ? ladder.querySelector(`.tc-time[data-band="${phase.band}"][data-side="${phase.side}"]`)
        : ladder.querySelector(`.tc-row.${phase.band}`);
    target?.classList.add('is-now');
}

function buildSunModalHTML() {
    const daily = state.astronomyDaily?.sunDailyEvents;
    const times = daily?.times;

    const condition = times?.solarCondition;
    const polarBanner = (condition && condition !== 'NORMAL')
        ? `<div class="polar-banner">${
              condition === 'POLAR_DAY'
                  ? 'Polar day — the sun stays above the horizon all day.'
                  : 'Polar night — the sun stays below the horizon all day.'
          }</div>`
        : '';

    const ladderRows = TWILIGHT_PAIRS.map(({ band, label, dawn, dusk }) => {
        const cell = (field, side) => {
            const iso = times?.[field];
            return `<span class="tc-time${iso ? '' : ' is-null'}" data-band="${band}" data-side="${side}">${
                iso ? formatTimeOfDay(iso) : '—'
            }</span>`;
        };
        return `
            <div class="tc-row ${band}">
                <span class="tc-label">${label}</span>
                ${cell(dawn, 'dawn')}
                ${cell(dusk, 'dusk')}
            </div>`;
    }).join('');

    const noonAltStr = daily?.solarNoon?.alt != null
        ? `${daily.solarNoon.alt.toFixed(1)}°`
        : '--';

    return `
        <div class="modal-section">
            <div class="sun-chart-readout" id="sun-chart-readout" aria-hidden="true"></div>
            <div class="sun-chart-block" id="sun-modal-chart"></div>
        </div>

        <div class="sun-stats-row">
            <div class="modal-row">
                <span class="label">Day length</span>
                <span class="value">${formatDuration(daily?.dayLengthSeconds)}</span>
            </div>
            <div class="modal-row">
                <span class="label">Astro night</span>
                <span class="value">${formatDuration(daily?.nightLengthSeconds)}</span>
            </div>
            <div class="modal-row">
                <span class="label">Noon altitude</span>
                <span class="value">${noonAltStr}</span>
            </div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title">Twilight</div>
            <div class="twilight-compact">
                <div class="tc-row tc-head">
                    <span class="tc-label"></span>
                    <span class="tc-col-label">Dawn</span>
                    <span class="tc-col-label">Dusk</span>
                </div>
                ${ladderRows}
            </div>
        </div>

        ${polarBanner}
    `;
}

function buildMoonModalHTML() {
    const daily    = state.astronomyDaily?.moonDailyEvents;
    const snapshot = state.moonSnapshot;
    const phase    = snapshot?.phase;

    const illumPct = phase?.illuminationPercent != null
        ? `${phase.illuminationPercent.toFixed(1)}%`
        : '--';
    const ageDays = phase?.ageDays != null
        ? `${phase.ageDays.toFixed(1)} days`
        : '--';

    const altDeg = snapshot?.currentAltitude;
    const altStr = altDeg != null ? `${altDeg.toFixed(1)}°` : '--';

    const peakAltStr = daily?.peak?.alt != null ? `${daily.peak.alt.toFixed(1)}°` : '--';
    const distanceKm = snapshot?.distanceKm != null
        ? `${Math.round(snapshot.distanceKm).toLocaleString('en-US')} km`
        : '--';

    return `
        <div class="modal-moon-hero">
            <div class="moon-disk-wrapper">
                <canvas class="moon-disk" id="moon-modal-canvas" aria-hidden="true"></canvas>
            </div>
            <div class="moon-phase-meta">
                <span class="phase-name">${phase?.phaseName ?? '--'}</span>
                <span class="phase-illum">${illumPct} illuminated · ${ageDays} old</span>
            </div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title">Cycle</div>
            ${buildMoonCycleTrackHTML(phase?.phaseDegrees)}
        </div>

        <div class="modal-section">
            <div class="modal-section-title">Position</div>
            <div class="modal-grid">
                <div class="modal-row">
                    <span class="label">Current altitude</span>
                    <span class="value">${altStr}</span>
                </div>
                <div class="modal-row">
                    <span class="label">Constellation</span>
                    <span class="value">${snapshot?.constellation ?? '--'}</span>
                </div>
                <div class="modal-row">
                    <span class="label">Distance</span>
                    <span class="value">${distanceKm}</span>
                </div>
                <div class="modal-row">
                    <span class="label">Peak altitude</span>
                    <span class="value">${peakAltStr}</span>
                </div>
            </div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title">Today</div>
            <div class="modal-grid">
                <div class="modal-row">
                    <span class="label">Moonrise</span>
                    <span class="value">${formatMoonEvent(daily?.rise)}</span>
                </div>
                <div class="modal-row">
                    <span class="label">Moonset</span>
                    <span class="value">${formatMoonEvent(daily?.set)}</span>
                </div>
                <div class="modal-row">
                    <span class="label">Lunar transit</span>
                    <span class="value">${formatTimeOfDay(daily?.peak?.time)}</span>
                </div>
            </div>
        </div>
    `;
}

// Waypoints around the synodic cycle, evenly spaced by phase angle (not by
// duration — the real month isn't evenly split by these events, but the
// track is a schematic position indicator, not a calendar).
const MOON_CYCLE_WAYPOINTS = [
    { pct: 0,   label: 'New' },
    { pct: 25,  label: 'First Q' },
    { pct: 50,  label: 'Full' },
    { pct: 75,  label: 'Last Q' },
    { pct: 100, label: 'New' },
];

// Horizontal cycle-position track for the moon modal: fixed waypoints at the
// four named phases plus a glowing "now" marker placed by the current phase
// angle (0-360°, from AstronomyEngine — 0/360 = new, 180 = full). Styled to
// match the sun chart's now-dot so the two modals read as one system.
function buildMoonCycleTrackHTML(phaseDegrees) {
    const nowPct = phaseDegrees != null ? (phaseDegrees / 360) * 100 : null;

    const ticks = MOON_CYCLE_WAYPOINTS.map(({ pct, label }) => `
        <div class="mc-tick" style="left:${pct}%">
            <span class="mc-tick-dot"></span>
            <span class="mc-tick-label">${label}</span>
        </div>`).join('');

    const nowMarker = nowPct != null
        ? `<div class="mc-now" style="left:${nowPct.toFixed(2)}%">
               <span class="mc-now-halo"></span>
               <span class="mc-now-dot"></span>
           </div>`
        : '';

    return `
        <div class="moon-cycle-track">
            <div class="mc-line"></div>
            ${ticks}
            ${nowMarker}
        </div>`;
}

function initAstroModal() {
    const modal   = document.getElementById('astro-modal');
    const sunEl   = document.getElementById('sun-card');
    const moonEl  = document.getElementById('moon-card');
    if (!modal || !sunEl || !moonEl) return;

    const openHandler = (which) => (e) => {
        e.preventDefault();
        openAstroModal(which, e.currentTarget);
    };
    sunEl.addEventListener('click', openHandler('sun'));
    moonEl.addEventListener('click', openHandler('moon'));

    // Keyboard activation — Enter/Space on the card.
    [sunEl, moonEl].forEach((card) => {
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openAstroModal(card === sunEl ? 'sun' : 'moon', card);
            }
        });
    });

    // Backdrop and close button both carry data-modal-dismiss.
    modal.addEventListener('click', (e) => {
        if (e.target?.dataset?.modalDismiss === 'true') closeAstroModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && state.openModal) closeAstroModal();
    });
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

const UV_CSS = {
    LOW: 'uv-low', MODERATE: 'uv-moderate', HIGH: 'uv-high',
    VERY_HIGH: 'uv-very-high', EXTREME: 'uv-extreme',
};

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

const STATUS_DOT_GLOW = {
    LIVE:    'rgba(34, 197, 94, 0.50)',
    DELAYED: 'rgba(252, 211, 77, 0.50)',
    STALE:   'rgba(249, 115, 22, 0.50)',
    OFFLINE: 'rgba(239, 68, 68, 0.50)',
};

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
    return value ?? '--';
}

function buildPopupHTML(details, dataStatus) {
    if (details.dataProvider === 'EXTERNAL_API') {
        // API-backed cards are independent of MQTT sensor freshness — see
        // buildApiPopupHTML.
        return buildApiPopupHTML(details);
    }

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

// API-backed cards have their own freshness story (the forecast's own
// timestamp), which has nothing to do with MQTT sensor lag — deliberately
// does not take a sensor `dataStatus` and never shows the DELAYED/STALE/
// OFFLINE badge those thresholds were built for.
function buildApiPopupHTML(details) {
    const timeSince = formatTimeSince(details.arrivedAt);

    return `
        <div class="popup-heading">${details.metricName ?? '--'}</div>
        <div class="popup-row">
            <span class="popup-key">Source</span>
            <span class="popup-val" style="color:#60a5fa; font-weight:600;">Open-Meteo API</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Forecast updated</span>
            <span class="popup-val">${formatArrivedAt(details.arrivedAt)}</span>
        </div>
        ${timeSince ? `
        <div class="popup-row">
            <span class="popup-key">Data age</span>
            <span class="popup-val">${timeSince}</span>
        </div>` : ''}
    `;
}

function buildDewRiskPopupHTML(risk, isMixed = false) {
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

    const mixedNote = isMixed ? `
        <div class="popup-divider"></div>
        <div class="popup-row" style="flex-direction:column; align-items:flex-start; gap:3px;">
            <span class="popup-key" style="color:#facc15;">⚠ Approximate</span>
            <span class="popup-val" style="text-align:left; line-height:1.5; font-weight:400; color:rgba(250,204,21,0.8);">Temperature and humidity come from different sources — dew point may be slightly inaccurate.</span>
        </div>` : '';

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
        ${mixedNote}
    `;
}

function setStatusCircleColor(circleEl, quality, dataStatus, dataProvider) {
    if (!circleEl) return;

    if (dataProvider === 'EXTERNAL_API') {
        // API-backed cards are independent of MQTT sensor freshness: the
        // sensor going STALE/OFFLINE says nothing about whether Open-Meteo
        // data is current, so `dataStatus` (sensor lag) never reaches here.
        // Always the flat "fresh API source" blue; never pulses, since the
        // data is polled on a fixed schedule, not a live sensor stream.
        const color = '#60a5fa';
        circleEl.style.backgroundColor = color;
        circleEl.style.boxShadow       = `0 0 0 2px ${color}33`;
        circleEl.classList.remove('pulsing');
        return;
    }

    const qSev  = QUALITY_SEVERITY[quality]   ?? 0;
    const dSev  = STATUS_SEVERITY[dataStatus] ?? 0;
    const color = (dSev >= qSev)
        ? (DATA_STATUS_COLORS[dataStatus]  ?? DATA_QUALITY_COLORS.MISSING)
        : (DATA_QUALITY_COLORS[quality]    ?? DATA_QUALITY_COLORS.MISSING);

    circleEl.style.backgroundColor = color;
    circleEl.style.boxShadow       = `0 0 0 2px ${color}33`;
    circleEl.classList.toggle('pulsing', quality === 'OK' && (!dataStatus || dataStatus === 'LIVE'));
}

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
        if (!isOpen && risk) openPopup(buildDewRiskPopupHTML(risk, badgeEl._dewMixed), badgeEl);
    });
}

function buildWetnessPopupHTML(wetness) {
    const status  = wetness?.surfaceWetnessStatus;
    const details = wetness?.dataDetails;
    const config  = SURFACE_WETNESS_CONFIG[status] ?? SURFACE_WETNESS_CONFIG.DRY;
    const qColor  = DATA_QUALITY_COLORS[details?.quality] ?? DATA_QUALITY_COLORS.MISSING;
    const pct     = wetness?.value != null ? wetness.value.toFixed(1) + '%' : '--';

    return `
        <div class="popup-heading">Surface Wetness</div>
        <div class="popup-row">
            <span class="popup-key">Reading</span>
            <span class="popup-val" style="color:${config.barColor}; font-weight:700;">${pct}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Status</span>
            <span class="popup-val">${config.label}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Quality</span>
            <span class="popup-val" style="color:${qColor}; font-weight:600;">${details?.quality ?? '--'}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Measured</span>
            <span class="popup-val">${formatArrivedAt(details?.arrivedAt)}</span>
        </div>
    `;
}

function initWetnessBadge() {
    const badgeEl = document.getElementById('wetness-badge');
    if (!badgeEl) return;

    badgeEl.style.cursor = 'pointer';
    badgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const wetness = badgeEl._wetnessData;
        const isOpen  = globalPopup.classList.contains('open')
                     && globalPopup._sourceEl === badgeEl;

        globalPopup.classList.remove('open');
        if (!isOpen && wetness) openPopup(buildWetnessPopupHTML(wetness), badgeEl);
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

// Safari tints its liquid-glass chrome by sampling the fixed .safari-*-anchor
// strips (theme-color only drives the iPhone status bar). After the app is
// backgrounded and resumed, the TOP strip's composited layer can come back
// stale or dropped, so Safari re-samples the wrong colour and the top chrome
// ends up matching the BOTTOM strip. Switching tabs fixes it by forcing a full
// re-composite — we reproduce that by hiding and re-showing the strips, which
// drops and rebuilds their layers and makes Safari take a fresh sample. The
// strips are 6px and sit behind the chrome, so the toggle is invisible.
function forceChromeRepaint() {
    const els = [
        document.querySelector('.safari-top-anchor'),
        document.querySelector('.safari-bottom-anchor'),
    ].filter(Boolean);
    if (!els.length) return;

    const cycle = () => {
        els.forEach(el => { el.style.display = 'none'; });
        void document.documentElement.offsetHeight; // commit the hide before re-show
        requestAnimationFrame(() => {
            els.forEach(el => { el.style.display = ''; });
        });
    };

    requestAnimationFrame(cycle);
    // Safari can take its chrome sample a beat after the tab becomes visible,
    // so run a second cycle shortly after to catch that later timing too.
    setTimeout(cycle, 250);
}

// When iOS Safari restores a tab from the Back-Forward Cache (bfcache), JS
// doesn't re-run and the 30s poll timer is frozen — so theme-color stays at
// whatever it was when the tab was frozen, even if the sky has since changed.
// pageshow (e.persisted) fires on every bfcache restore; visibilitychange
// catches switching back to the tab without a full bfcache restore. Both
// re-stamp theme-color from the localStorage cache immediately, before the
// next poll tick, so the status bar matches the current sky on first glance,
// and force the anchor strips to re-sample so the top chrome can't get stuck
// on the bottom colour.
function refreshChromeColorFromCache() {
    try {
        const c = JSON.parse(localStorage.getItem('skyColors') || 'null');
        if (c?.version === '2' && c.topHex) setBrowserChromeColor(c.topHex);
    } catch (_) {}
    forceChromeRepaint();
}
window.addEventListener('pageshow', (e) => { if (e.persisted) refreshChromeColorFromCache(); });
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshChromeColorFromCache();
});
// macOS Safari can regain focus on an app-switch without firing
// visibilitychange (the window was never marked hidden), yet the chrome sample
// can still be stale — so re-sample on window focus as well.
window.addEventListener('focus', refreshChromeColorFromCache);

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
initWetnessBadge();
initAstroModal();
initHealthPopover();
initBgPreference();
initStarField();
window.setStarFieldModalDim = setStarFieldModalDim;
loadDaily();
startPolling(updateLive, 30000);