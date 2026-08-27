// sky-background.js
//
// The page background that tracks the sun: altitude -> gradient + card surface
// colours written into CSS custom properties, the browser-chrome tint that
// follows them, and the user's dynamic/static background preference.
//
// The dashboard owns the sun altitude, so this module reads it through a
// getSunAltitude() accessor supplied at init rather than importing state.

import {
    SKY_ANCHORS,
    lerpTriplet,
    desaturateColor,
    skyBrightnessForAltitude,
    skyBottomRgbAt,
    rgbString,
    rgbaString,
    rgbHex,
} from './sky-colors.js';
import { closeAllPopovers } from './metric-popovers.js';

// Supplied by initBgPreference; see the module comment.
let getSunAltitude = () => null;
let onApplied      = () => {};

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
// How far popup/modal panels shift from the static card color toward the
// live (desaturated) sky color. Kept modest so golden-hour warmth tints
// the panel rather than washing out text contrast.
const POPUP_TINT_RATIO         = 0.25;

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

    // Popup/modal panel color: the static card base nudged toward the
    // desaturated sky-bottom hue, so overlays visibly track time of day
    // while dashboard cards themselves stay put (see --popup-bg-strong).
    const popupBgRgb = lerpTriplet(cardBgRgb, ambientRgb, POPUP_TINT_RATIO);

    return {
        top:              rgbString(topRgb),
        bottom:           rgbString(bottomRgb),
        cardBg:           rgbaString(cardBgRgb, CARD_BG_ALPHA),
        cardBorder:       rgbaString(accRgb,    CARD_BORDER_ALPHA),
        divider:          rgbaString(accRgb,    DIVIDER_ALPHA),
        cardBgStrong:     rgbaString(cardBgRgb, CARD_BG_STRONG_ALPHA),
        cardBorderStrong: rgbaString(accRgb,    CARD_BORDER_STRONG_ALPHA),
        popupBgStrong:    rgbaString(popupBgRgb, CARD_BG_STRONG_ALPHA),
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

// Returns the altitude the *displayed* sky corresponds to. When the user has
// pinned a static background preset, the actual sun altitude is irrelevant — a
// midday preset at night must not show stars, and a night preset at noon should
// show them. Dynamic mode always uses the real sun altitude.
export function getStarAltitude(sunAltDeg) {
    const pref = loadBgPreference();
    if (pref.mode === 'static') return SKY_ANCHORS[pref.anchorIndex]?.alt ?? null;
    return sunAltDeg;
}

// Sky adaptation passed to drawMoon. Uses the *effective* altitude (the same one
// that drives star visibility) so a pinned static background preset washes the
// moon to match the displayed sky rather than the real sun position.
export function moonAmbientFor(sunAltDeg) {
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
    root.style.setProperty('--popup-bg-strong',    colors.popupBgStrong);

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
            popupBgStrong: colors.popupBgStrong,
        }));
    } catch (e) { /* private mode / quota */ }
}

export function renderSkyBackground(sunAltitudeDeg) {
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

export function loadBgPreference() {
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
        const alt = getSunAltitude();
        if (alt != null) renderSkyBackground(alt);
    }
    // Star visibility and moon appearance both depend on the sky and are both
    // rendered by the dashboard, so it supplies the follow-up rather than this
    // module reaching back into it.
    onApplied?.();
}

function updateSwatchActive(pref) {
    document.querySelectorAll('.bg-swatch').forEach(el => {
        const active = pref.mode === el.dataset.mode &&
            (pref.mode === 'dynamic' || String(pref.anchorIndex) === el.dataset.anchor);
        el.classList.toggle('active', active);
    });
}

export function initBgPreference({ getSunAltitude: gsa, onApplied: cb } = {}) {
    getSunAltitude = gsa ?? getSunAltitude;
    onApplied      = cb ?? onApplied;
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
        if (opening) closeAllPopovers('bgpref');
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
