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
import { createSkyPicker, xForAltitude, ALT_MIN } from './sky-picker.js';

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
        // Raw endpoints for paintChromeTint, which interpolates between them.
        topRgb:           topRgb,
        bottomRgb:        bottomRgb,
    };
}

// True only inside an iOS home-screen web app. `navigator.standalone` is a
// WebKit-only API, which is exactly the scoping we want: Android Chrome also
// matches `display-mode: standalone` but handles theme-color correctly there,
// so testing the media query instead would break Android's live tint.
export function isIosStandalone() {
    return navigator.standalone === true;
}

// Installed on the iOS home screen, `apple-mobile-web-app-status-bar-style:
// black-translucent` only takes effect while there is NO <meta name="theme-color">
// in the document. With one present, iOS paints an opaque status bar from it and
// freezes that colour at launch — which is how a night sky ended up under a
// daytime-blue bar. Removing the meta is what restores the translucent bar, so
// the sky gradient runs edge-to-edge underneath it; body's safe-area-inset
// padding is what keeps content from hiding behind the clock.
//
// Safari 26 ignores theme-color for its own chrome regardless (that tint comes
// from html's background-color — see paintChromeTint), so removing the meta
// costs nothing there; this is scoped to the installed app anyway.
function stripThemeColorMeta() {
    document.head.querySelectorAll('meta[name="theme-color"]').forEach(el => el.remove());
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
    // Re-adding the meta on the 30s tick would hand iOS an opaque status bar
    // back a moment after the boot script removed it.
    if (isIosStandalone()) {
        stripThemeColorMeta();
        return;
    }
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
// pinned a static background, the actual sun altitude is irrelevant — a
// midday sky at night must not show stars, and a night sky at noon should
// show them. Dynamic mode always uses the real sun altitude.
export function getStarAltitude(sunAltDeg) {
    const pref = loadBgPreference();
    if (pref.mode === 'static') return pref.altitude;
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

// Safari 26 no longer reads <meta name="theme-color"> for its chrome tint — it
// samples a qualifying fixed element at the viewport edge, else <body>'s
// background-color, else <html>'s. Only the body/html route has WebKit's live
// observer, which is why the old .safari-*-anchor strips are now display:none
// (see the CSS): a fixed element outranks body/html and then never re-samples.
//
// <html> rather than <body> because #star-field is z-index:-1 and paints behind
// body's background — an opaque <body> colour would hide the stars. html's
// background is the page canvas, so it sits under everything. Its own gradient
// background-image paints over this colour and is unaffected; only the
// background-color *property* is what Safari samples.
//
// The value must be a literal. Left as `var(--bg-grad-bottom)` it rides :root's
// 12s transition, and Safari re-samples on discrete changes rather than during
// an interpolation. (Measured: with a literal, the chrome switches immediately
// while the page keeps transitioning — the two are allowed to disagree for 12s.)
//
// Safari derives ONE tint for the whole browser UI, so the top and bottom
// chrome cannot be given different colours — a fixed element could target each
// edge separately, but that is the route with no live observer, which is the
// whole reason the strips were removed.
//
// So instead of picking an endpoint, this samples the gradient *where the
// chrome actually meets it*: the bottom edge of the viewport. The gradient is
// painted on html's own box (see the CSS), so the colour at that edge is the
// ramp interpolated at (scrollY + innerHeight) / htmlHeight. On iOS the only
// tinted chrome is the bottom toolbar, so it blends with the page immediately
// above it at every scroll position and every time of day — and the top edge
// where the chrome is at the top instead (macOS, iPad); see chromeIsAtBottom.
//
// Why not just send the top or the bottom colour: measured across SKY_ANCHORS,
// top-vs-bottom separation is negligible at night (ΔRGB 26-36) but severe at
// dawn and dusk (168 at the horizon anchor, 187 at golden hour) where the sky
// is cool above and warm at the horizon. Either endpoint is therefore wrong by
// most of the ramp for half the day. Flattening the ramp would also fix it, but
// it costs the warm horizon — the whole reason dusk looks like dusk.
//
// This is free to do because html's background-color is now purely a tint
// signal: the gradient background-image paints over it everywhere except the
// overscroll-bounce region, so it can carry any colour without being seen.
let tintTopRgb = null;
let tintBottomRgb = null;
let lastTintHex = null;
let tintScheduled = false;

function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Which viewport edge the browser chrome actually sits against. iPhone Safari
// puts its toolbar at the BOTTOM; macOS Safari tints the tab bar at the TOP, as
// does iPad. Since Safari derives one tint for the whole UI, sampling the wrong
// edge is not neutral — it is maximally wrong, because the two ends of the ramp
// are furthest apart exactly when the mismatch is most visible (dawn/dusk).
//
// maxTouchPoints alone would misclassify iPad, whose chrome is at the top. The
// short side of the screen separates them and is orientation-invariant: a phone
// is under 500px that way in both portrait and landscape, a tablet is not.
// Worst case this is cosmetic — a wrong guess picks the other edge, nothing
// breaks.
function chromeIsAtBottom() {
    // Installed on the home screen there is no browser chrome at all, top or
    // bottom — the only thing at a viewport edge is the translucent status bar,
    // which is at the TOP. The status bar itself shows real page pixels rather
    // than a tint, so what this actually decides in standalone is the colour of
    // the overscroll rubber-band: sampling the bottom edge made a pull-down at
    // the top flash a bottom-of-ramp colour against the gradient's top.
    if (isIosStandalone()) return false;
    return navigator.maxTouchPoints > 0 &&
           Math.min(window.innerWidth, window.innerHeight) < 500;
}

// Height of the iOS status bar overlaying the page, 0 everywhere else.
function safeAreaTop() {
    const v = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue('--safe-area-top'));
    return Number.isFinite(v) ? v : 0;
}

// Fraction of the gradient sitting against the chrome.
function viewportChromeFraction() {
    const boxH = document.documentElement.offsetHeight || window.innerHeight || 1;
    // Sampling the top edge means scrollY — the top of the *document*. In the
    // installed app that is wrong by the height of the status bar: the bar is
    // painted flat from this colour while the page under it keeps drawing the
    // gradient, so taking the ramp at scrollY makes the bar a shade earlier than
    // the pixels directly below it, and the seam shows. Offsetting by the safe
    // area samples where the bar actually ends. Measured on device the error is
    // only ~7 ΔRGB, but a flat band against a gradient makes it legible.
    const y = chromeIsAtBottom()
        ? window.scrollY + window.innerHeight
        : window.scrollY + safeAreaTop();
    return Math.min(1, Math.max(0, y / boxH));
}

function paintChromeTint() {
    if (!tintTopRgb || !tintBottomRgb) return;
    const hex = rgbHex(lerpTriplet(tintTopRgb, tintBottomRgb, viewportChromeFraction()));
    // Writing on every scroll frame would repaint the canvas for no visible
    // gain; the colour only matters when it actually changes by a whole step.
    if (hex === lastTintHex) return;
    lastTintHex = hex;
    document.documentElement.style.backgroundColor = hex;
}

// Coalesced to one write per frame at most. Deliberately rAF rather than a
// timer: a timer firing mid-gesture is exactly the pattern that re-introduces
// scroll judder on iOS, and rAF is already aligned with the compositor.
function scheduleChromeTint() {
    if (tintScheduled) return;
    tintScheduled = true;
    requestAnimationFrame(() => { tintScheduled = false; paintChromeTint(); });
}

function setChromeTintEndpoints(topRgb, bottomRgb) {
    if (!topRgb || !bottomRgb) return;
    tintTopRgb = topRgb;
    tintBottomRgb = bottomRgb;
    paintChromeTint();
}

window.addEventListener('scroll', scheduleChromeTint, { passive: true });
window.addEventListener('resize', scheduleChromeTint);

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
    setChromeTintEndpoints(colors.topRgb, colors.bottomRgb);
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
// BACKGROUND PREFERENCE
// ==========================================
//
// Stored as { mode: 'dynamic' } or { mode: 'static', altitude, x }: a static
// background is chosen by sun altitude on the picker's arc (sky-picker.js), so
// it can be any colour dynamic mode shows. `x` only remembers which side of
// the arc the sun was left on — morning or evening give the same colours.
//
// It used to be { mode: 'static', anchorIndex } into six fixed presets;
// loadBgPreference converts that to the anchor's altitude, so a saved choice
// survives the change.

export function loadBgPreference() {
    let pref;
    try { pref = JSON.parse(localStorage.getItem('bgPreference') || 'null'); } catch { pref = null; }
    if (pref?.mode !== 'static') return { mode: 'dynamic' };
    if (typeof pref.altitude === 'number') return pref;
    const anchor = SKY_ANCHORS[pref.anchorIndex];
    return anchor
        ? { mode: 'static', altitude: anchor.alt, x: xForAltitude(anchor.alt) }
        : { mode: 'dynamic' };
}

function saveBgPreference(pref) {
    try { localStorage.setItem('bgPreference', JSON.stringify(pref)); } catch {}
}

function applyBgPreference(pref) {
    saveBgPreference(pref);
    if (pref.mode === 'static') {
        applySkyColors(computeSkyColors(pref.altitude), true);
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

export function initBgPreference({ getSunAltitude: gsa, onApplied: cb } = {}) {
    getSunAltitude = gsa ?? getSunAltitude;
    onApplied      = cb ?? onApplied;
    // Apply saved static preference before the first astronomy poll arrives.
    const pref = loadBgPreference();
    if (pref.mode === 'static') applySkyColors(computeSkyColors(pref.altitude), true);

    const swatchesEl = document.getElementById('bg-pref-swatches');
    if (!swatchesEl) return;

    swatchesEl.innerHTML = `
        <button type="button" class="bg-swatch" data-mode="dynamic" title="Changes with sun position">
            <span class="bg-swatch-circle bg-swatch-dynamic-circle"></span>
            <span class="bg-swatch-label">Dynamic — follows sun</span>
        </button>
        <div class="bg-picker-hint">Or drag the sun to fix the sky</div>
        <div class="sky-picker"></div>`;

    const dynamicBtn = swatchesEl.querySelector('[data-mode="dynamic"]');

    const choose = (altitude, x) => {
        applyBgPreference({ mode: 'static', altitude, x });
        dynamicBtn.classList.remove('active');
    };
    const picker = createSkyPicker(swatchesEl.querySelector('.sky-picker'), {
        // Every frame of a drag repaints the page, so the reader sees the
        // background they are choosing rather than a thumbnail of it.
        onInput:  choose,
        onCommit: choose,
    });

    // In dynamic mode the sun sits, dimmed, where the real sun is — on the
    // morning or evening half by the clock — so the picker always shows the
    // sky currently on screen, and grabbing it starts from there.
    const syncPicker = () => {
        const p = loadBgPreference();
        dynamicBtn.classList.toggle('active', p.mode === 'dynamic');
        if (p.mode === 'static') {
            picker.set({ x: p.x ?? xForAltitude(p.altitude) });
        } else {
            const alt  = getSunAltitude() ?? ALT_MIN;
            const side = new Date().getHours() < 12 ? 'rise' : 'set';
            picker.set({ x: xForAltitude(alt, side), following: true });
        }
    };
    syncPicker();

    dynamicBtn.addEventListener('click', () => {
        applyBgPreference({ mode: 'dynamic' });
        syncPicker();
    });

    const btn     = document.getElementById('bg-pref-btn');
    const popover = document.getElementById('bg-pref-popover');
    if (!btn || !popover) return;

    // Interacting inside the popover must not count as an outside click: a drag
    // that ends anywhere still fires a click, which would close it mid-choice.
    popover.addEventListener('click', e => e.stopPropagation());

    btn.addEventListener('click', e => {
        e.stopPropagation();
        const opening = !popover.classList.contains('open');
        if (opening) {
            closeAllPopovers('bgpref');
            syncPicker();
        }
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


// When iOS Safari restores a tab from the Back-Forward Cache (bfcache), JS
// doesn't re-run and the 30s poll timer is frozen — so theme-color stays at
// whatever it was when the tab was frozen, even if the sky has since changed.
// pageshow (e.persisted) fires on every bfcache restore; visibilitychange
// catches switching back to the tab without a full bfcache restore. Both
// re-stamp theme-color from the localStorage cache immediately, before the
// next poll tick, so the status bar matches the current sky on first glance.
function refreshChromeColorFromCache() {
    try {
        const c = JSON.parse(localStorage.getItem('skyColors') || 'null');
        if (c?.version === '2' && c.topHex) {
            setBrowserChromeColor(c.topHex);
            setChromeTintEndpoints(hexToRgb(c.topHex), hexToRgb(c.bottomHex));
        }
    } catch (_) {}
}
window.addEventListener('pageshow', (e) => { if (e.persisted) refreshChromeColorFromCache(); });
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshChromeColorFromCache();
});
// macOS Safari can regain focus on an app-switch without firing
// visibilitychange (the window was never marked hidden), yet the chrome sample
// can still be stale — so re-sample on window focus as well.
window.addEventListener('focus', refreshChromeColorFromCache);
