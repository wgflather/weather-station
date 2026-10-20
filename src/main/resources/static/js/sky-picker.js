// sky-picker.js
//
// The static-background picker: a schematic sun arc the reader drags the sun
// along, choosing the background by sun altitude — the same quantity dynamic
// mode follows. It replaced six fixed preset swatches, which reached only six
// points of a palette dynamic mode shows continuously.
//
// The arc is schematic, not today's sun: it runs night → midday → night across
// the whole palette range (SKY_ANCHORS' first to last altitude), so every
// colour is reachable whatever the season. A real winter curve would stop well
// short of the midday anchors. Height uses the same 1:1 altitude scale as the
// sun card, and the backdrop is painted column by column with the background
// each point would give, so the picker doubles as a preview.
//
// Pure UI: it reports altitudes through onInput (live, per frame while
// dragging) and onCommit (on release / key press), and knows nothing about
// storage or how the page is painted — sky-background.js owns both.

import { SKY_ANCHORS, altitudeScale, skyTopRgbAt, skyBottomRgbAt, sunAppearanceAt, rgbString } from './sky-colors.js';

export const ALT_MIN = SKY_ANCHORS[0].alt;
export const ALT_MAX = SKY_ANCHORS[SKY_ANCHORS.length - 1].alt;

// SVG geometry, in viewBox units. CSS scales it to the popover width at this
// same aspect ratio (so the sun stays round); pointer positions are mapped
// through the rendered rect.
const W = 200;
const H = 84;
const PAD_TOP    = 12;   // room for the marker's glow at the peak
const PAD_BOTTOM = 8;
const BACKDROP_STOPS = 32;

const SVG_NS = 'http://www.w3.org/2000/svg';

// Keyboard steps, as a fraction of the arc's width.
const KEY_STEP       = 1 / 120;
const KEY_STEP_LARGE = 1 / 24;

/** Altitude at position x ∈ [0, 1]: night at both ends, the palette's peak in the middle. */
export function altitudeAtX(x) {
    return ALT_MIN + (ALT_MAX - ALT_MIN) * (1 - Math.cos(2 * Math.PI * x)) / 2;
}

/**
 * Position of `alt` on the arc. Every altitude but the peak sits at two places —
 * morning and evening — and `side` picks which: 'rise' for the left half, 'set'
 * for the right.
 */
export function xForAltitude(alt, side = 'rise') {
    const t = Math.max(0, Math.min(1, (alt - ALT_MIN) / (ALT_MAX - ALT_MIN)));
    const half = Math.acos(1 - 2 * t) / (2 * Math.PI);  // 0 … 0.5
    return side === 'set' ? 1 - half : half;
}

/** Plain name for the sky at `alt` — the bands SKY_ANCHORS is built around. */
export function phaseName(alt) {
    if (alt < -12) return 'Night';
    if (alt < -6)  return 'Nautical twilight';
    if (alt < -1)  return 'Civil twilight';
    if (alt < 3)   return 'Sunrise / sunset';
    if (alt < 10)  return 'Golden hour';
    if (alt < 22)  return 'Morning';
    if (alt < 40)  return 'Midday';
    return 'Bright midday';
}

function fmtAlt(alt) {
    const r = Math.round(alt);
    return `${r > 0 ? '+' : ''}${r}°`;
}

function el(tag, attrs = {}) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
}

/**
 * Builds the picker inside `root`. Returns `{ set }`, where
 * `set({ x, following })` places the sun — `following` dims it, for dynamic
 * mode, where it marks the real sun rather than a choice.
 */
export function createSkyPicker(root, { onInput, onCommit }) {
    const { horizonY, yOf } = altitudeScale({
        maxAlt: ALT_MAX, minAlt: ALT_MIN, top: PAD_TOP, bottom: H - PAD_BOTTOM,
    });
    const xPx = (x) => x * W;

    const svg = el('svg', {
        class: 'sky-picker-svg', viewBox: `0 0 ${W} ${H}`,
        role: 'slider', tabindex: '0', 'aria-label': 'Background sky',
        'aria-valuemin': String(ALT_MIN), 'aria-valuemax': String(ALT_MAX),
    });

    // Backdrop: one horizontal gradient of top-of-sky colours, with a second of
    // bottom-of-sky colours faded in downwards over it — so each column runs from
    // that point's top colour to its bottom colour, a miniature of the page.
    const defs = el('defs');
    const topGrad = el('linearGradient', { id: 'skyp-top', x1: '0', x2: '1', y1: '0', y2: '0' });
    const botGrad = el('linearGradient', { id: 'skyp-bot', x1: '0', x2: '1', y1: '0', y2: '0' });
    for (let i = 0; i <= BACKDROP_STOPS; i++) {
        const x = i / BACKDROP_STOPS;
        const alt = altitudeAtX(x);
        const offset = `${(x * 100).toFixed(2)}%`;
        topGrad.append(el('stop', { offset, 'stop-color': rgbString(skyTopRgbAt(alt)) }));
        botGrad.append(el('stop', { offset, 'stop-color': rgbString(skyBottomRgbAt(alt)) }));
    }
    const fade = el('linearGradient', { id: 'skyp-fade', x1: '0', x2: '0', y1: '0', y2: '1' });
    fade.append(el('stop', { offset: '0%', 'stop-color': 'white', 'stop-opacity': '0' }),
                el('stop', { offset: '100%', 'stop-color': 'white', 'stop-opacity': '1' }));
    const mask = el('mask', { id: 'skyp-mask', maskContentUnits: 'objectBoundingBox' });
    mask.append(el('rect', { x: '0', y: '0', width: '1', height: '1', fill: 'url(#skyp-fade)' }));
    const blur = el('filter', { id: 'skyp-glow', x: '-150%', y: '-150%', width: '400%', height: '400%' });
    blur.append(el('feGaussianBlur', { stdDeviation: '2.4' }));
    defs.append(topGrad, botGrad, fade, mask, blur);

    let pathD = '';
    for (let i = 0; i <= 96; i++) {
        const x = i / 96;
        pathD += `${i ? 'L' : 'M'}${xPx(x).toFixed(1)},${yOf(altitudeAtX(x)).toFixed(1)}`;
    }

    const halo = el('circle', { class: 'sky-picker-halo', r: '8', filter: 'url(#skyp-glow)' });
    const dot  = el('circle', { class: 'sky-picker-dot', r: '5' });
    const marker = el('g', { class: 'sky-picker-marker' });
    marker.append(halo, dot);

    svg.append(
        defs,
        el('rect', { x: '0', y: '0', width: W, height: H, fill: 'url(#skyp-top)' }),
        el('rect', { x: '0', y: '0', width: W, height: H, fill: 'url(#skyp-bot)', mask: 'url(#skyp-mask)' }),
        el('line', { class: 'sky-picker-horizon', x1: '0', x2: W, y1: horizonY.toFixed(1), y2: horizonY.toFixed(1) }),
        el('path', { class: 'sky-picker-curve', d: pathD }),
        marker,
    );

    const readout = document.createElement('div');
    readout.className = 'sky-picker-readout';
    root.replaceChildren(svg, readout);

    let current = 0.5;

    function render(x, following) {
        current = x;
        const alt = altitudeAtX(x);
        marker.setAttribute('transform', `translate(${xPx(x).toFixed(1)},${yOf(alt).toFixed(1)})`);
        marker.classList.toggle('following', following);

        // The same sun the card and modal draw, so it reads as the same object.
        const a = sunAppearanceAt(alt);
        dot.setAttribute('fill', rgbString(a.core));
        halo.setAttribute('fill', rgbString(a.halo));
        halo.setAttribute('opacity', a.glowInnerAlpha.toFixed(2));

        const text = `${phaseName(alt)} · ${fmtAlt(alt)}`;
        readout.textContent = following ? `Following the sun · ${fmtAlt(alt)}` : text;
        svg.setAttribute('aria-valuenow', String(Math.round(alt)));
        svg.setAttribute('aria-valuetext', text);
    }

    // ---- dragging --------------------------------------------------------
    // Coalesced to one onInput per frame: each one repaints the whole page.
    let dragging = false;
    let pendingX = null;
    let raf = null;

    const xFromEvent = (e) => {
        const r = svg.getBoundingClientRect();
        return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    };
    const queue = (x) => {
        pendingX = x;
        if (raf) return;
        raf = requestAnimationFrame(() => {
            raf = null;
            render(pendingX, false);
            onInput?.(altitudeAtX(pendingX), pendingX);
        });
    };
    const finish = () => {
        if (!dragging) return;
        dragging = false;
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        if (pendingX != null) render(pendingX, false);
        onCommit?.(altitudeAtX(current), current);
    };

    svg.addEventListener('pointerdown', (e) => {
        dragging = true;
        try { svg.setPointerCapture(e.pointerId); } catch { /* no-op */ }
        queue(xFromEvent(e));
    });
    svg.addEventListener('pointermove', (e) => { if (dragging) queue(xFromEvent(e)); });
    svg.addEventListener('pointerup', finish);
    svg.addEventListener('pointercancel', finish);

    svg.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
        let x = current;
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp')        x += step;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')  x -= step;
        else return;
        e.preventDefault();
        x = Math.max(0, Math.min(1, x));
        render(x, false);
        onCommit?.(altitudeAtX(x), x);
    });

    return {
        set({ x, following = false }) { render(x, following); },
    };
}
