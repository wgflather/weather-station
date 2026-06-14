import { renderWeatherChart } from './weather-chart.js';
import { FetchScheduler } from './FetchScheduler.js';

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

async function fetchDashboardDaily() {
    const response = await fetch('/api/weather/dashboard/daily');
    if (!response.ok) throw new Error('Daily dashboard fetch failed');
    return await response.json();
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

// Eight named lunar phases → inline SVG content drawn inside .moon-disk.
// Lit area is yellow (#fcd34d), unlit is dark (#1a2842). The crescent /
// gibbous shapes use two arcs of differing horizontal radii so the
// terminator looks like a real ellipse rather than a straight line.
const MOON_PHASE_SVG = {
    'New Moon':        `<circle cx="50" cy="50" r="48" fill="#1a2842" stroke="#3a4d72" stroke-width="1"/>`,
    'Waxing Crescent': `<circle cx="50" cy="50" r="48" fill="#1a2842"/>
                        <path d="M50 2 A48 48 0 0 1 50 98 A22 48 0 0 0 50 2 Z" fill="#fcd34d"/>`,
    'First Quarter':   `<circle cx="50" cy="50" r="48" fill="#1a2842"/>
                        <path d="M50 2 A48 48 0 0 1 50 98 Z" fill="#fcd34d"/>`,
    'Waxing Gibbous':  `<circle cx="50" cy="50" r="48" fill="#fcd34d"/>
                        <path d="M50 2 A22 48 0 0 1 50 98 A48 48 0 0 1 50 2 Z" fill="#1a2842"/>`,
    'Full Moon':       `<circle cx="50" cy="50" r="48" fill="#fcd34d"/>`,
    'Waning Gibbous':  `<circle cx="50" cy="50" r="48" fill="#fcd34d"/>
                        <path d="M50 2 A48 48 0 0 0 50 98 A22 48 0 0 1 50 2 Z" fill="#1a2842"/>`,
    'Last Quarter':    `<circle cx="50" cy="50" r="48" fill="#1a2842"/>
                        <path d="M50 2 A48 48 0 0 0 50 98 Z" fill="#fcd34d"/>`,
    'Waning Crescent': `<circle cx="50" cy="50" r="48" fill="#1a2842"/>
                        <path d="M50 2 A22 48 0 0 1 50 98 A48 48 0 0 0 50 2 Z" fill="#fcd34d"/>`,
};

function formatTimeOfDay(isoString) {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return isNaN(date.getTime())
        ? '--:--'
        : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
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

    document.getElementById('sun-card-rise').textContent = formatTimeOfDay(sun.rise);
    document.getElementById('sun-card-set').textContent  = formatTimeOfDay(sun.set);
    document.getElementById('sun-card-noon').textContent = formatTimeOfDay(sun.solarNoon?.time);

    const noonAltEl = document.getElementById('sun-card-noon-alt');
    const noonAlt   = sun.solarNoon?.alt;
    noonAltEl.textContent = (noonAlt != null) ? `${Math.round(noonAlt)}°` : '--°';

    document.getElementById('sun-day-length').textContent = formatDuration(sun.dayLengthSeconds);
}

function renderMoonCard(moon) {
    if (!moon) return;

    document.getElementById('moon-card-rise').textContent = formatTimeOfDay(moon.rise);
    document.getElementById('moon-card-set').textContent  = formatTimeOfDay(moon.set);
    // The moon phase itself isn't on the daily-events DTO — it lives on
    // the live snapshot (which is the correct cadence since phase drifts
    // continuously). renderAstronomyLive handles it.
}

function renderAstronomyLive(sunSnapshot, moonSnapshot) {
    setPositionPill('sun-position',  sunSnapshot?.currentAltitude);
    setPositionPill('moon-position', moonSnapshot?.currentAltitude);

    renderSkyBackground(sunSnapshot?.currentAltitude);

    if (moonSnapshot?.phase) {
        renderMoonPhase(moonSnapshot.phase);
    }

    // Keep the open modal's live fields in sync on every poll tick.
    if (state.openModal) renderActiveModal();
}

// ==========================================
// DYNAMIC SKY BACKGROUND & CARD COLORS
// ==========================================
//
// Anchor table: each row defines, for a given sun altitude (degrees),
// the top/bottom sky gradient colors plus the card surface and accent
// (border + divider) colors. The current altitude is linearly
// interpolated between bracketing anchors and the results are written
// into CSS custom properties; @property + a 12s transition do the
// smooth animation between values.
//
// Card colors stay cool/blue across all phases so light text remains
// readable; they shift just enough in brightness and saturation to
// harmonise with the sky rather than fight it. The +30° anchor matches
// the original static palette so the daytime "baseline" is unchanged.
//
// Symmetric in altitude — dawn and dusk render identically because they
// hit the same altitude values on the way up vs the way down.
const SKY_ANCHORS = [
    // alt   sky top              sky bottom            card bg              card accent (border + divider)
    { alt: -18, top: [  8,  13,  26], bottom: [ 19,  26,  46], cardBg: [ 22,  30,  56], cardAcc: [125, 145, 195] },  // astronomical night
    { alt: -12, top: [ 14,  26,  54], bottom: [ 29,  42,  82], cardBg: [ 28,  40,  75], cardAcc: [138, 158, 210] },  // nautical twilight
    { alt:  -6, top: [ 29,  38,  73], bottom: [ 61,  58, 110], cardBg: [ 40,  52, 102], cardAcc: [148, 168, 222] },  // civil twilight
    { alt:  -1, top: [ 42,  59, 106], bottom: [196, 122,  82], cardBg: [ 52,  72, 125], cardAcc: [165, 188, 235] },  // horizon (rise/set)
    { alt:   5, top: [ 62,  90, 142], bottom: [232, 160, 106], cardBg: [ 55,  92, 152], cardAcc: [172, 200, 240] },  // golden hour
    { alt:  15, top: [ 38,  85, 155], bottom: [100, 160, 200], cardBg: [ 55,  95, 160], cardAcc: [168, 202, 245] },  // morning / late afternoon
    { alt:  30, top: [ 25,  95, 175], bottom: [ 80, 160, 205], cardBg: [ 52,  92, 162], cardAcc: [165, 200, 248] },  // mid-day blue
    { alt:  50, top: [ 22,  90, 170], bottom: [ 65, 145, 210], cardBg: [ 50,  90, 160], cardAcc: [175, 210, 252] },  // bright midday
];

// Alpha channels for the card surface and accent vars. Kept constant
// across phases so only the hue/value shifts — the apparent solidity
// of cards doesn't change with the sky.
const CARD_BG_ALPHA           = 0.64;
const CARD_BORDER_ALPHA       = 0.22;
const DIVIDER_ALPHA           = 0.16;
// Stronger variants for elements that need to feel solid against the
// page (FAB, modal panel, astro-card hover state).
const CARD_BG_STRONG_ALPHA     = 0.92;
const CARD_BORDER_STRONG_ALPHA = 0.32;

function lerpChannel(a, b, t) {
    return Math.round(a + (b - a) * t);
}

function lerpTriplet(a, b, t) {
    return [lerpChannel(a[0], b[0], t), lerpChannel(a[1], b[1], t), lerpChannel(a[2], b[2], t)];
}

function rgbString([r, g, b])          { return `rgb(${r}, ${g}, ${b})`; }
function rgbaString([r, g, b], alpha)  { return `rgba(${r}, ${g}, ${b}, ${alpha})`; }
function rgbHex([r, g, b])             { return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join(''); }

function buildSkyState(lo, hi, t) {
    const topRgb    = lerpTriplet(lo.top,     hi.top,     t);
    const bottomRgb = lerpTriplet(lo.bottom,  hi.bottom,  t);
    const cardBgRgb = lerpTriplet(lo.cardBg,  hi.cardBg,  t);
    const accRgb    = lerpTriplet(lo.cardAcc, hi.cardAcc, t);

    return {
        top:              rgbString(topRgb),
        bottom:           rgbString(bottomRgb),
        cardBg:           rgbaString(cardBgRgb, CARD_BG_ALPHA),
        cardBorder:       rgbaString(accRgb,    CARD_BORDER_ALPHA),
        divider:          rgbaString(accRgb,    DIVIDER_ALPHA),
        // Solid-feeling variants — same hue, higher alpha. Used by FAB,
        // modal panel, and card hover so they harmonise with the cards
        // but read as a layer above the page.
        cardBgStrong:     rgbaString(cardBgRgb, CARD_BG_STRONG_ALPHA),
        cardBorderStrong: rgbaString(accRgb,    CARD_BORDER_STRONG_ALPHA),
        // Hex forms for <meta name="theme-color"> — some older browsers
        // only accept hex there, even though modern ones happily take
        // rgb() / rgba(). The bottom color tracks the iOS Safari URL bar
        // (which sits at the bottom of the viewport); the top is kept
        // available for browsers with a top-mounted URL bar.
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

let skyBackgroundPrimed = false;

function renderSkyBackground(sunAltitudeDeg) {
    const colors = computeSkyColors(sunAltitudeDeg);
    // No altitude data → leave the CSS custom properties at their
    // initial values, which match the original static palette.
    if (!colors) return;
    const root = document.documentElement;

    // First successful render snaps directly to the correct sky instead
    // of animating in from the static deep-blue defaults. Subsequent
    // ticks use the 12s transition defined on :root.
    const snap = !skyBackgroundPrimed;
    if (snap) root.style.transition = 'none';

    root.style.setProperty('--bg-grad-top',        colors.top);
    root.style.setProperty('--bg-grad-bottom',     colors.bottom);
    root.style.setProperty('--card-bg',            colors.cardBg);
    root.style.setProperty('--card-border',        colors.cardBorder);
    root.style.setProperty('--divider',            colors.divider);
    root.style.setProperty('--card-bg-strong',     colors.cardBgStrong);
    root.style.setProperty('--card-border-strong', colors.cardBorderStrong);

    if (snap) {
        // Flush the no-transition styles, then clear the inline override
        // so the stylesheet's transition rule applies to the next update.
        void root.offsetWidth;
        root.style.transition = '';
        skyBackgroundPrimed = true;
    }

    // Browser chrome (URL bar on Chrome / Android / iOS Safari 15+) reads
    // the <meta name="theme-color"> tag. We track the *bottom* of the sky
    // gradient because the iOS Safari URL bar — the main consumer of this
    // signal — sits at the bottom of the viewport; tracking the top would
    // leave a visible color seam between the toolbar tint and the page
    // above it. setBrowserChromeColor replaces the element to work around
    // iOS Safari's caching of the initial value.
    setBrowserChromeColor(colors.bottomHex);

    // Persist the resolved palette so the inline <head> script can apply
    // it before first paint on the *next* load. Safari (iOS + macOS) only
    // samples theme-color / page colors once at initial paint and ignores
    // subsequent JS updates, so the only way to make the URL bar / toolbar
    // tint match reality is to have the right values already present in
    // the document when Safari samples it. After one successful tick this
    // cache is the most accurate snapshot available.
    try {
        localStorage.setItem('skyColors', JSON.stringify({
            top:              colors.top,
            bottom:           colors.bottom,
            cardBg:           colors.cardBg,
            cardBorder:       colors.cardBorder,
            divider:          colors.divider,
            cardBgStrong:     colors.cardBgStrong,
            cardBorderStrong: colors.cardBorderStrong,
            bottomHex:        colors.bottomHex,
        }));
    } catch (e) { /* private mode / quota — fall back to defaults next load */ }
}

function setPositionPill(elementId, altitudeDeg) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (altitudeDeg == null) {
        el.textContent     = '--';
        el.dataset.state   = 'below';
        return;
    }
    const isUp         = altitudeDeg > 0;
    el.textContent     = isUp ? `Up · ${Math.round(altitudeDeg)}°` : 'Below horizon';
    el.dataset.state   = isUp ? 'up' : 'below';
}

// ==========================================
// ASTRONOMY MODAL
// ==========================================

// Twilight transitions, in chronological order through a normal day.
// Each entry maps a SunTimesDto field → display label + colour band.
const TWILIGHT_LADDER = [
    { field: 'astronomicalNightEnd',   label: 'Astronomical twilight begins', band: 'astronomical' },
    { field: 'nauticalDawn',           label: 'Nautical twilight begins',      band: 'nautical'     },
    { field: 'civilDawn',              label: 'Civil twilight begins',         band: 'civil'        },
    { field: 'sunrise',                label: 'Sunrise',                       band: 'daylight'     },
    { field: 'sunset',                 label: 'Sunset',                        band: 'daylight'     },
    { field: 'civilDusk',              label: 'Civil twilight ends',           band: 'civil'        },
    { field: 'nauticalDusk',           label: 'Nautical twilight ends',        band: 'nautical'     },
    { field: 'astronomicalNightStart', label: 'Astronomical twilight ends',    band: 'astronomical' },
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

    // Focus the close button so keyboard users land somewhere sensible.
    modal.querySelector('.astro-modal-close')?.focus();
}

function closeAstroModal() {
    if (!state.openModal) return;
    const modal = document.getElementById('astro-modal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    unlockBodyScroll();
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

function renderActiveModal() {
    const body = document.getElementById('astro-modal-body');
    if (!body) return;
    if (state.openModal === 'sun')  body.innerHTML = buildSunModalHTML();
    if (state.openModal === 'moon') body.innerHTML = buildMoonModalHTML();
}

function buildSunModalHTML() {
    const daily    = state.astronomyDaily?.sunDailyEvents;
    const snapshot = state.sunSnapshot;
    const times    = daily?.times;

    const condition = times?.solarCondition;
    const polarBanner = (condition && condition !== 'NORMAL')
        ? `<div class="polar-banner">${
              condition === 'POLAR_DAY'
                  ? 'Polar day — the sun stays above the horizon all day.'
                  : 'Polar night — the sun stays below the horizon all day.'
          }</div>`
        : '';

    const ladderRows = TWILIGHT_LADDER.map(({ field, label, band }) => {
        const iso = times?.[field];
        const display = iso ? formatTimeOfDay(iso) : '—';
        const nullCls = iso ? '' : ' is-null';
        return `
            <div class="twilight-row ${band}">
                <span class="twilight-label">${label}</span>
                <span class="twilight-time${nullCls}">${display}</span>
            </div>`;
    }).join('');

    const altDeg = snapshot?.currentAltitude;
    const altStr = altDeg != null ? `${altDeg.toFixed(1)}°` : '--';
    const positionText = altDeg == null
        ? '--'
        : (altDeg > 0 ? `Above horizon (${altStr})` : `Below horizon (${altStr})`);

    const noonAltStr = daily?.solarNoon?.alt != null
        ? `${daily.solarNoon.alt.toFixed(1)}°`
        : '--';

    return `
        <div class="modal-section">
            <div class="modal-section-title">Position</div>
            <div class="modal-grid">
                <div class="modal-row">
                    <span class="label">Current altitude</span>
                    <span class="value">${positionText}</span>
                </div>
                <div class="modal-row">
                    <span class="label">Solar noon altitude</span>
                    <span class="value">${noonAltStr}</span>
                </div>
            </div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title">Today</div>
            <div class="modal-grid">
                <div class="modal-row">
                    <span class="label">Sunrise</span>
                    <span class="value">${formatTimeOfDay(daily?.rise)}</span>
                </div>
                <div class="modal-row">
                    <span class="label">Sunset</span>
                    <span class="value">${formatTimeOfDay(daily?.set)}</span>
                </div>
                <div class="modal-row">
                    <span class="label">Day length</span>
                    <span class="value">${formatDuration(daily?.dayLengthSeconds)}</span>
                </div>
                <div class="modal-row">
                    <span class="label">Night length</span>
                    <span class="value">${formatDuration(daily?.nightLengthSeconds)}</span>
                </div>
            </div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title">Twilight transitions</div>
            <div class="twilight-ladder">${ladderRows}</div>
        </div>

        ${polarBanner}
    `;
}

function buildMoonModalHTML() {
    const daily    = state.astronomyDaily?.moonDailyEvents;
    const snapshot = state.moonSnapshot;
    const phase    = snapshot?.phase;

    const phaseSvg = phase?.phaseName
        ? (MOON_PHASE_SVG[phase.phaseName] ?? MOON_PHASE_SVG['New Moon'])
        : MOON_PHASE_SVG['New Moon'];

    const illumPct = phase?.illuminationPercent != null
        ? `${phase.illuminationPercent.toFixed(1)}%`
        : '--';
    const ageDays = phase?.ageDays != null
        ? `${phase.ageDays.toFixed(1)} days`
        : '--';

    const altDeg = snapshot?.currentAltitude;
    const altStr = altDeg != null ? `${altDeg.toFixed(1)}°` : '--';
    const positionText = altDeg == null
        ? '--'
        : (altDeg > 0 ? `Above horizon (${altStr})` : `Below horizon (${altStr})`);

    const peakAltStr = daily?.peak?.alt != null ? `${daily.peak.alt.toFixed(1)}°` : '--';
    const distanceKm = snapshot?.distanceKm != null
        ? `${Math.round(snapshot.distanceKm).toLocaleString('en-US')} km`
        : '--';

    return `
        <div class="modal-section">
            <div class="modal-moon-hero">
                <svg class="moon-disk" viewBox="0 0 100 100" aria-hidden="true">${phaseSvg}</svg>
                <div class="moon-phase-meta">
                    <span class="phase-name">${phase?.phaseName ?? '--'}</span>
                    <span class="phase-illum">${illumPct} illuminated · ${ageDays} old</span>
                </div>
            </div>
        </div>

        <div class="modal-section">
            <div class="modal-section-title">Position</div>
            <div class="modal-grid">
                <div class="modal-row">
                    <span class="label">Current altitude</span>
                    <span class="value">${positionText}</span>
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
                    <span class="value">${formatTimeOfDay(daily?.rise)}</span>
                </div>
                <div class="modal-row">
                    <span class="label">Moonset</span>
                    <span class="value">${formatTimeOfDay(daily?.set)}</span>
                </div>
                <div class="modal-row">
                    <span class="label">Lunar transit</span>
                    <span class="value">${formatTimeOfDay(daily?.peak?.time)}</span>
                </div>
            </div>
        </div>
    `;
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

function renderMoonPhase(phase) {
    const disk = document.getElementById('moon-disk');
    const name = document.getElementById('moon-phase-name');
    const pct  = document.getElementById('moon-phase-illum');
    if (!disk || !name || !pct) return;

    const svg = MOON_PHASE_SVG[phase.phaseName] ?? MOON_PHASE_SVG['New Moon'];
    // Only redraw if the phase name actually changed — saves DOM churn
    // on every live tick (phase name only flips every few days).
    if (disk.dataset.phase !== phase.phaseName) {
        disk.innerHTML     = svg;
        disk.dataset.phase = phase.phaseName;
    }

    name.textContent = phase.phaseName ?? '--';
    pct.textContent  = (phase.illuminationPercent != null)
        ? phase.illuminationPercent.toFixed(0)
        : '--';
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

async function loadDaily() {
    try {
        const daily            = await fetchDashboardDaily();
        state.astronomyDaily   = daily;
        state.dailyKey         = daily.dailyKey;
        renderAstronomyDaily(daily);
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
initAstroModal();
loadDaily();
startPolling(updateLive, 30000);