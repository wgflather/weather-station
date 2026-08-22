// astro-modal.js
//
// The sun/moon detail modal opened from the astronomy cards. Extracted from
// fetch-data.js, which had grown to own eleven unrelated concerns.
//
// The modal's own state (which body is open, where focus returns to, the
// scroll-lock offset) lives here rather than in the dashboard's shared state
// object — nothing outside this module ever needed to read it. The *data* the
// modal renders is still owned by the dashboard, so it is supplied through a
// `getData()` accessor rather than passed per call: the modal re-reads it on
// every rebuild and tick, which is what keeps live patching working.

import { drawMoon } from './moon-canvas.js';
import {
    renderSunModalChart,
    updateSunModalChartLive,
    destroySunModalChart,
    getCurrentTwilightPhase,
} from './sun-modal-chart.js';
import { setStarFieldModalDim } from './star-field.js';
import { formatTimeOfDay, formatMoonEvent, formatDuration } from './time-format.js';

// Compact twilight ladder rows: one row per band, dawn and dusk crossings
// side by side. Brightest band first, mirroring the chart's gradient.
const TWILIGHT_PAIRS = [
    { band: 'daylight',     label: 'Daylight',     dawn: 'sunrise',              dusk: 'sunset'                 },
    { band: 'civil',        label: 'Civil',        dawn: 'civilDawn',            dusk: 'civilDusk'              },
    { band: 'nautical',     label: 'Nautical',     dawn: 'nauticalDawn',         dusk: 'nauticalDusk'           },
    { band: 'astronomical', label: 'Astronomical', dawn: 'astronomicalNightEnd', dusk: 'astronomicalNightStart' },
];

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

// ---- module-private state -------------------------------------------------

let openModal = null;         // 'sun' | 'moon' | null
let modalReturnFocus = null;  // element to restore focus to on close
let scrollLockY = null;       // scroll position frozen while open
let getData = () => ({});     // supplied by initAstroModal

// ---- scroll locking -------------------------------------------------------

// iOS Safari + Android Chrome ignore `overflow: hidden` on <body> for touch
// scrolling, so the page underneath would still scroll while the modal is
// open — that's what produces the flicker (the URL bar collapses, the
// viewport reflows, the fixed backdrop appears to jump). The reliable fix
// is to pin <body> to a fixed position offset by the current scroll, then
// restore the offset on close so the user lands back where they were.
function lockBodyScroll() {
    if (scrollLockY != null) return;
    const scrollY = window.scrollY;
    scrollLockY = scrollY;
    const body = document.body;
    body.style.position = 'fixed';
    body.style.top      = `-${scrollY}px`;
    body.style.left     = '0';
    body.style.right    = '0';
    body.style.width    = '100%';
}

function unlockBodyScroll() {
    if (scrollLockY == null) return;
    const y = scrollLockY;
    const body = document.body;
    body.style.position = '';
    body.style.top      = '';
    body.style.left     = '';
    body.style.right    = '';
    body.style.width    = '';
    window.scrollTo(0, y);
    scrollLockY = null;
}

// ---- rendering ------------------------------------------------------------

// Full modal (re)build. Runs on open and on daily rollover / zone change —
// NOT on the 30-second poll tick (see patchAstroModalLive), so the sun
// chart's SVG survives ticks and scrubbing is never interrupted.
function renderActiveModal() {
    const body = document.getElementById('astro-modal-body');
    if (!body) return;
    const data = getData();

    if (openModal === 'sun') {
        destroySunModalChart();
        body.innerHTML = buildSunModalHTML(data);
        updateTwilightNowHighlight();
        // Chart container is now in the DOM — render on the next frame so
        // CSS layout has resolved and clientWidth/Height are non-zero.
        requestAnimationFrame(() => {
            const el = document.getElementById('sun-modal-chart');
            if (!el || openModal !== 'sun') return;
            const live = getData();
            renderSunModalChart(el, {
                sun: live.astronomyDaily?.sunDailyEvents,
                currentAltitude: live.sunSnapshot?.currentAltitude,
                dailyKey: live.dailyKey,
            });
        });
    }

    if (openModal === 'moon') {
        body.innerHTML = buildMoonModalHTML(data);
        // Canvas is now in the DOM — draw into it on the next frame so CSS
        // layout has resolved and offsetWidth/Height are non-zero.
        requestAnimationFrame(() => {
            const canvas = document.getElementById('moon-modal-canvas');
            if (!canvas) return;
            const snap = getData().moonSnapshot;
            drawMoon(canvas, snap?.phase?.phaseDegrees ?? 0, snap?.parallacticAngle ?? 0);
        });
    }
}

// Marks the twilight ladder cell (or row, for daylight) matching the phase
// the clock is in right now.
function updateTwilightNowHighlight() {
    const ladder = document.querySelector('#astro-modal-body .twilight-compact');
    if (!ladder) return;
    ladder.querySelectorAll('.is-now').forEach((el) => el.classList.remove('is-now'));

    const phase = getCurrentTwilightPhase(getData().astronomyDaily?.sunDailyEvents?.times);
    if (!phase || phase.band === 'night') return;
    const target = phase.side
        ? ladder.querySelector(`.tc-time[data-band="${phase.band}"][data-side="${phase.side}"]`)
        : ladder.querySelector(`.tc-row.${phase.band}`);
    target?.classList.add('is-now');
}

function buildSunModalHTML({ astronomyDaily }) {
    const daily = astronomyDaily?.sunDailyEvents;
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

function buildMoonModalHTML({ astronomyDaily, moonSnapshot }) {
    const daily    = astronomyDaily?.moonDailyEvents;
    const snapshot = moonSnapshot;
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

// ---- public API -----------------------------------------------------------

export function openAstroModal(which, trigger) {
    openModal        = which;
    modalReturnFocus = trigger ?? null;

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

export function closeAstroModal() {
    if (!openModal) return;
    destroySunModalChart();
    const modal = document.getElementById('astro-modal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    unlockBodyScroll();
    setStarFieldModalDim(false);
    openModal = null;
    modalReturnFocus?.focus?.();
    modalReturnFocus = null;
}

/** Full rebuild if a modal is open; no-op otherwise. Use on daily rollover. */
export function refreshAstroModal() {
    if (openModal) renderActiveModal();
}

/**
 * Cheap per-poll-tick refresh of the open modal; no-op if none is open. The
 * moon modal is plain text/canvas, so a full rebuild stays fine; the sun modal
 * only patches its live bits to keep the chart's DOM (and any in-flight scrub)
 * intact.
 */
export function patchAstroModalLive() {
    if (openModal === 'moon') {
        renderActiveModal();
        return;
    }
    if (openModal === 'sun') {
        updateSunModalChartLive(getData().sunSnapshot?.currentAltitude);
        updateTwilightNowHighlight();
    }
}

/**
 * Binds the cards, backdrop and Escape key.
 *
 * `dataAccessor` returns the dashboard's current astronomy data as
 * `{ astronomyDaily, sunSnapshot, moonSnapshot, dailyKey }`. It is re-read on
 * every render rather than captured, so the modal always reflects the latest
 * poll without the dashboard having to push updates in.
 */
export function initAstroModal(dataAccessor) {
    getData = dataAccessor ?? getData;

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
        if (e.key === 'Escape' && openModal) closeAstroModal();
    });
}
