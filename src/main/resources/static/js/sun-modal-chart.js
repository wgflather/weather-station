// Whole-day sun altitude chart for the sun detail modal. Renders an SVG with
// the day's altitude curve, fixed markers for sunrise / sunset / solar noon,
// a live "now" dot, and pointer scrubbing.
//
// Two independent color systems are layered on the curve:
//   - The AREA FILL is colored per-segment from the *real* sun-altitude →
//     sky color model in sky-colors.js (the same table driving the live page
//     background) — answers "what did the sky actually look like at that
//     moment". Always the true dynamic altitude, independent of the user's
//     pinned static-background preference, since the curve describes an
//     astronomical fact about the day, not the page's current theme. As the
//     largest-area element it carries the dominant color signal.
//   - The STROKE uses a time-axis twilight gradient (color stops derived
//     from the SunTimesDto transitions) — answers "what twilight phase is
//     this hour", matching the ladder below the chart. Kept as a muted,
//     single-path line so it stays legible without competing with the fill.
//
// Lifecycle contract with fetch-data.js:
//   renderSunModalChart(container, { sun, currentAltitude, dailyKey })
//       — full build; called on modal open and on daily rollover rebuilds.
//   updateSunModalChartLive(currentAltitude)
//       — cheap per-poll-tick patch; moves the now marker only.
//   destroySunModalChart()
//       — idempotent teardown; must run before rebuilds and on modal close.

import { skyBottomRgbAt } from './sky-colors.js';

// ==========================================
// TWILIGHT MODEL
// ==========================================

// Chronological solar transitions through a normal day. `before`/`after` name
// the twilight band on each side of the crossing; `side` marks which half of
// the day the transition belongs to (used for ladder highlighting).
const TWILIGHT_SEQUENCE = [
    { field: 'astronomicalNightEnd',   before: 'night',        after: 'astronomical', side: 'dawn' },
    { field: 'nauticalDawn',           before: 'astronomical', after: 'nautical',     side: 'dawn' },
    { field: 'civilDawn',              before: 'nautical',     after: 'civil',        side: 'dawn' },
    { field: 'sunrise',                before: 'civil',        after: 'daylight',     side: 'dawn' },
    { field: 'sunset',                 before: 'daylight',     after: 'civil',        side: 'dusk' },
    { field: 'civilDusk',              before: 'civil',        after: 'nautical',     side: 'dusk' },
    { field: 'nauticalDusk',           before: 'nautical',     after: 'astronomical', side: 'dusk' },
    { field: 'astronomicalNightStart', before: 'astronomical', after: 'night',        side: 'dusk' },
];

// Matches the .tc-row band dot palette in style.css.
const BAND_COLORS = {
    night:        '#4c5b7f',
    astronomical: '#6b7fa8',
    nautical:     '#8aa3d0',
    civil:        '#c9d8f5',
    daylight:     '#fcd34d',
};

// The transitions that actually occur today, in chronological order.
function presentTransitions(times) {
    if (!times) return [];
    return TWILIGHT_SEQUENCE
        .map((t) => ({ ...t, ms: times[t.field] ? Date.parse(times[t.field]) : NaN }))
        .filter((t) => !isNaN(t.ms))
        .sort((a, b) => a.ms - b.ms);
}

/**
 * Which twilight phase the clock is in right now. Returns
 * `{ band, side }` where `side` is 'dawn'/'dusk' for twilight bands and null
 * for daylight/night (and for the ambiguous trough before the first or after
 * the last transition). Null when no transition occurs today (polar).
 */
export function getCurrentTwilightPhase(times, nowMs = Date.now()) {
    const transitions = presentTransitions(times);
    if (!transitions.length) return null;
    let current = { band: transitions[0].before, side: null };
    for (const t of transitions) {
        if (nowMs < t.ms) break;
        const terminal = t.after === 'daylight' || t.after === 'night';
        current = { band: t.after, side: terminal ? null : t.side };
    }
    return current;
}

// Band to use when the sun never crosses a twilight boundary all day: pick by
// how high the sun gets, so an all-twilight day near the poles is honest.
function polarBand(sun) {
    if (sun.times?.solarCondition === 'POLAR_DAY') return 'daylight';
    const noonAlt = sun.solarNoon?.alt;
    if (noonAlt == null) return 'night';
    if (noonAlt > -6)  return 'civil';
    if (noonAlt > -12) return 'nautical';
    if (noonAlt > -18) return 'astronomical';
    return 'night';
}

/**
 * Gradient stops (offset 0-1 = time fraction of the day) for the twilight
 * gradient. Terminal bands (night, daylight) are anchored flat at their
 * boundary transitions; twilight bands get a single mid-interval stop so the
 * gradient blends softly across each crossing — matching how twilight
 * actually brightens. Absent transitions simply emit no stop, so the deepest
 * band reached colors the edges (high-latitude summers stay blue, polar days
 * collapse to a single color).
 */
function buildGradientStops(sun, startMs, endMs) {
    const transitions = presentTransitions(sun.times);
    const off = (ms) => clamp01((ms - startMs) / (endMs - startMs));

    if (!transitions.length) {
        const color = BAND_COLORS[polarBand(sun)];
        return [{ offset: 0, color }, { offset: 1, color }];
    }

    const first = transitions[0];
    const last  = transitions[transitions.length - 1];
    const stops = [
        { offset: 0,             color: BAND_COLORS[first.before] },
        { offset: off(first.ms), color: BAND_COLORS[first.before] },
    ];
    for (let i = 0; i < transitions.length - 1; i++) {
        const a = transitions[i];
        const b = transitions[i + 1];
        const band = a.after;
        if (band === 'daylight') {
            stops.push({ offset: off(a.ms), color: BAND_COLORS.daylight });
            stops.push({ offset: off(b.ms), color: BAND_COLORS.daylight });
        } else {
            stops.push({ offset: off((a.ms + b.ms) / 2), color: BAND_COLORS[band] });
        }
    }
    stops.push({ offset: off(last.ms), color: BAND_COLORS[last.after] });
    stops.push({ offset: 1,            color: BAND_COLORS[last.after] });

    // SVG requires non-decreasing offsets; clamping also dedupes edge cases.
    let prev = 0;
    for (const s of stops) {
        if (s.offset < prev) s.offset = prev;
        prev = s.offset;
    }
    return stops;
}

// ==========================================
// GEOMETRY
// ==========================================

const PAD_X      = 8;
const PAD_TOP    = 34;   // headroom for the peak label chip above the curve
const PAD_BOTTOM = 28;   // room for the time axis
// Same vertical philosophy as the card curve: horizon 60% down, daytime arc
// slightly padded — but a deeper night trough (0.60 vs the card's 0.25) so
// the −18° depth line has honest meaning at modal size.
const HORIZON_FRACTION = 0.60;
const ABOVE_PADDING    = 0.88;
const BELOW_PADDING    = 0.60;

function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}

function fmtTime(iso) {
    const d = new Date(iso);
    return isNaN(d.getTime())
        ? '--:--'
        : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtAlt(alt) {
    return `${alt >= 0 ? '+' : ''}${alt.toFixed(1)}°`;
}

// ==========================================
// LABEL CHIPS (peak + now)
// ==========================================

// Pill-shaped SVG labels with a dashed leader line down to their dot, so
// they stay legible over any part of the gradient and can be repositioned
// dynamically without colliding.
const CHIP_PAD_X   = 7;
const CHIP_PAD_Y   = 4;
const CHIP_GAP     = 6;    // minimum clearance between the two chips
const CHIP_MIN_TOP = 2;    // chips may use the PAD_TOP headroom, not overflow it
// Staggered leader lengths: peak chip hugs its point, now chip floats higher.
const PEAK_LEADER  = 10;
const NOW_LEADER   = 26;

const SVG_NS = 'http://www.w3.org/2000/svg';

function makeChip(svg, kind) {
    const el = (tag, cls) => {
        const node = document.createElementNS(SVG_NS, tag);
        node.setAttribute('class', cls);
        return node;
    };
    const g = el('g', `sun-chip sun-chip-${kind}`);
    g.setAttribute('visibility', 'hidden');
    const leader = el('line', 'sun-chip-leader');
    const rect = el('rect', 'sun-chip-bg');
    rect.setAttribute('rx', '7');
    const text = el('text', 'sun-chip-text');
    if (kind === 'now') {
        const tag = el('tspan', 'sun-chip-tag');
        tag.textContent = 'NOW';
        const val = el('tspan', 'sun-chip-val');
        val.setAttribute('dx', '5');
        text.append(tag, val);
    }
    g.append(leader, rect, text);
    svg.appendChild(g);
    return { g, leader, rect, text, w: 0, h: 0, bbx: 0, bby: 0 };
}

// Measures the chip's text and derives the pill size. Falls back to a 1px
// smaller font when the label would outgrow the plot (extreme narrow panels).
function sizeChip(chip, plotW) {
    // Reset any position from a previous layout before measuring: getBBox()
    // reports the box at the text's current x/y, so leftover coordinates
    // would skew the stored offsets and fling the text off-canvas on the
    // next placement (visible as a blank pill after a poll tick).
    chip.text.removeAttribute('x');
    chip.text.removeAttribute('y');
    chip.text.removeAttribute('font-size');
    let bb = chip.text.getBBox();
    if (bb.width + 2 * CHIP_PAD_X > plotW) {
        chip.text.setAttribute('font-size', '9');
        bb = chip.text.getBBox();
    }
    chip.bbx = bb.x;
    chip.bby = bb.y;
    chip.w = bb.width + 2 * CHIP_PAD_X;
    chip.h = bb.height + 2 * CHIP_PAD_Y;
}

function boxesCollide(a, b, gap) {
    return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x
        && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

// Anchors the chip above its dot, clamped into the plot, dodging `avoidBox`
// (the other chip) first vertically, then sideways when there is no headroom.
function placeChip(chip, anchor, leaderLen, avoidBox) {
    const { plotL, plotR } = chart.scale;
    const box = {
        x: Math.max(plotL, Math.min(plotR - chip.w, anchor.x - chip.w / 2)),
        y: Math.max(CHIP_MIN_TOP, anchor.y - leaderLen - chip.h),
        w: chip.w,
        h: chip.h,
    };
    if (avoidBox && boxesCollide(box, avoidBox, CHIP_GAP)) {
        const raisedY = avoidBox.y - CHIP_GAP - chip.h;
        if (raisedY >= CHIP_MIN_TOP) {
            box.y = raisedY;
        } else {
            const rightX = avoidBox.x + avoidBox.w + CHIP_GAP;
            const leftX  = avoidBox.x - CHIP_GAP - chip.w;
            const preferRight = anchor.x >= avoidBox.x + avoidBox.w / 2;
            if (preferRight && rightX + chip.w <= plotR) box.x = rightX;
            else if (leftX >= plotL)                     box.x = leftX;
            else if (rightX + chip.w <= plotR)           box.x = rightX;
            // No room either side (degenerate width) — leave clamped position.
        }
    }

    chip.rect.setAttribute('x', box.x.toFixed(1));
    chip.rect.setAttribute('y', box.y.toFixed(1));
    chip.rect.setAttribute('width', box.w.toFixed(1));
    chip.rect.setAttribute('height', box.h.toFixed(1));
    chip.text.setAttribute('x', (box.x + CHIP_PAD_X - chip.bbx).toFixed(1));
    chip.text.setAttribute('y', (box.y + CHIP_PAD_Y - chip.bby).toFixed(1));

    // Leader from the chip's bottom edge down to the dot; its top end stays
    // within the pill's width even when the chip was nudged sideways.
    const leaderTopX = Math.max(box.x + 8, Math.min(box.x + box.w - 8, anchor.x));
    chip.leader.setAttribute('x1', leaderTopX.toFixed(1));
    chip.leader.setAttribute('y1', (box.y + box.h).toFixed(1));
    chip.leader.setAttribute('x2', anchor.x.toFixed(1));
    chip.leader.setAttribute('y2', (anchor.y - 6).toFixed(1));

    chip.g.setAttribute('visibility', 'visible');
    return box;
}

// Lays out both chips. The peak chip is anchored first; the now chip dodges
// it. Re-run on every now-marker move so the layout holds at all times of
// day, including when "now" approaches solar noon.
function layoutChips() {
    if (!chart?.els) return;
    const { els } = chart;
    let peakBox = null;
    if (els.peakChip && chart.peakAnchor) {
        peakBox = placeChip(els.peakChip, chart.peakAnchor, PEAK_LEADER, null);
    }
    if (els.nowChip) {
        if (chart.nowAnchor && chart.currentAltitude != null) {
            placeChip(els.nowChip, chart.nowAnchor, NOW_LEADER, peakBox);
        } else {
            els.nowChip.g.setAttribute('visibility', 'hidden');
        }
    }
}

// ==========================================
// CHART SINGLETON
// ==========================================

// Only one sun modal can exist, so the mounted chart is module state.
let chart = null;

// Full-resolution (1-minute) curve cache. Keyed by dailyKey so reopening the
// modal the same day never refetches and midnight rollover invalidates
// naturally. Survives modal close/reopen on purpose.
let fullCurve = { key: null, points: null, promise: null };

/** Full build. `sun` is SunDailyEvents (with sunCurve merged in). */
export function renderSunModalChart(container, { sun, currentAltitude, dailyKey }) {
    destroySunModalChart();
    if (!container || !sun?.sunCurve?.length) return;

    const points = fullCurve.key === dailyKey && fullCurve.points?.length
        ? fullCurve.points
        : sun.sunCurve;

    chart = {
        container,
        sun,
        dailyKey,
        currentAltitude,
        points,
        scale: null,
        els: null,
        scrubRaf: null,
        pendingScrubX: null,
        resizeTimer: null,
        resizeHandler: null,
    };

    buildSvg();

    chart.resizeHandler = () => {
        if (!chart) return;
        clearTimeout(chart.resizeTimer);
        chart.resizeTimer = setTimeout(() => { if (chart) buildSvg(); }, 150);
    };
    window.addEventListener('resize', chart.resizeHandler);

    ensureFullCurve(dailyKey);
}

/** Per-poll-tick patch: move the now marker, leave everything else alone. */
export function updateSunModalChartLive(currentAltitude) {
    if (!chart) return;
    chart.currentAltitude = currentAltitude;
    positionNowMarker();
}

/** Idempotent teardown. The SVG's own listeners die with the DOM. */
export function destroySunModalChart() {
    if (!chart) return;
    window.removeEventListener('resize', chart.resizeHandler);
    clearTimeout(chart.resizeTimer);
    if (chart.scrubRaf) cancelAnimationFrame(chart.scrubRaf);
    chart = null;
}

// Fetches the 1-minute curve once per day-key and swaps it into the mounted
// chart. Failure is silent beyond a warning — the CARD-resolution curve
// already on screen is a fully functional fallback (scrub snaps to 10 min).
function ensureFullCurve(dailyKey) {
    if (fullCurve.key === dailyKey && (fullCurve.points || fullCurve.promise)) return;
    fullCurve = { key: dailyKey, points: null, promise: null };
    fullCurve.promise = fetch('/api/astronomy/curve?body=SUN&resolution=FULL_CHART')
        .then((res) => {
            if (!res.ok) throw new Error(`FULL_CHART fetch failed: ${res.status}`);
            return res.json();
        })
        .then((dto) => {
            if (fullCurve.key !== dailyKey) return;
            fullCurve.promise = null;
            if (!dto?.points?.length) return;
            fullCurve.points = dto.points;
            if (chart && chart.dailyKey === dailyKey) {
                chart.points = dto.points;
                buildSvg();
            }
        })
        .catch((err) => {
            console.warn('Sun modal: full-resolution curve unavailable, keeping card curve.', err);
            if (fullCurve.key === dailyKey) fullCurve.promise = null;
        });
}

// ==========================================
// SVG BUILD
// ==========================================

function buildSvg() {
    const { container, sun, points } = chart;
    const W = Math.max(container.clientWidth || 0, 260);
    const H = Math.max(container.clientHeight || 0, 140);

    let maxAlt = 0;
    let minAlt = 0;
    for (const p of points) {
        if (p.altitude > maxAlt) maxAlt = p.altitude;
        if (p.altitude < minAlt) minAlt = p.altitude;
    }
    // Degenerate-scale guard for polar days/nights (same as the card curve).
    maxAlt = Math.max(maxAlt, 1);
    minAlt = Math.min(minAlt, -1);

    const startMs = Date.parse(points[0].time);
    const endMs   = Date.parse(points[points.length - 1].time);

    const plotL = PAD_X;
    const plotR = W - PAD_X;
    const plotW = plotR - plotL;
    const plotT = PAD_TOP;
    const plotB = H - PAD_BOTTOM;
    const horizonY = plotT + (plotB - plotT) * HORIZON_FRACTION;

    const xOf = (ms) => plotL + clamp01((ms - startMs) / (endMs - startMs)) * plotW;
    const yOf = (alt) => alt >= 0
        ? horizonY - (alt / maxAlt) * (horizonY - plotT) * ABOVE_PADDING
        : horizonY + (Math.abs(alt) / Math.abs(minAlt)) * (plotB - horizonY) * BELOW_PADDING;
    // Keep marker labels clear of the plot edges (half an HH:MM at 11px).
    const clampLabelX = (x) => Math.max(plotL + 26, Math.min(plotR - 26, x));

    chart.scale = { W, H, startMs, endMs, plotL, plotR, plotW, plotT, plotB, horizonY, xOf, yOf };

    // Altitude curve. ~288 segments (≈5-min steps on the full curve) draw
    // smoothly at panel width; scrubbing still indexes the unsampled array.
    // The stroke needs one continuous path, so build that from the sampled
    // vertices — but the area fill is drawn as per-segment filled quads,
    // each colored by the real sky-altitude color at its midpoint, so the
    // backdrop reads as "the sky the sun actually passed through" rather
    // than a flat time-based tint. Each quad also gets a matching stroke to
    // paper over anti-aliasing seams between adjacent, near-identical fills.
    const N = points.length;
    const step = Math.max(1, Math.floor(N / 288));
    const vertices = [];
    for (let i = 0; i < N; i += step) vertices.push(points[i]);
    if (vertices[vertices.length - 1] !== points[N - 1]) vertices.push(points[N - 1]);

    let lineD = '';
    let fillSegmentsSvg = '';
    for (let i = 0; i < vertices.length; i++) {
        const x = xOf(Date.parse(vertices[i].time)).toFixed(1);
        const y = yOf(vertices[i].altitude).toFixed(1);
        lineD += `${i === 0 ? 'M' : 'L'}${x},${y}`;
        if (i > 0) {
            const prev = vertices[i - 1];
            const [px, py] = [xOf(Date.parse(prev.time)).toFixed(1), yOf(prev.altitude).toFixed(1)];
            const midAlt = (prev.altitude + vertices[i].altitude) / 2;
            const [r, g, b] = skyBottomRgbAt(midAlt);
            const color = `rgb(${r},${g},${b})`;
            fillSegmentsSvg += `<polygon points="${px},${py} ${x},${y} ${x},${plotB.toFixed(1)} ${px},${plotB.toFixed(1)}" fill="${color}" stroke="${color}" stroke-width="1"/>`;
        }
    }

    const stopsSvg = buildGradientStops(sun, startMs, endMs)
        .map((s) => `<stop offset="${(s.offset * 100).toFixed(2)}%" stop-color="${s.color}"/>`)
        .join('');

    // Astronomical-night depth line, only when the sun actually gets there
    // today. No numeric label — the line itself (plus the ladder below the
    // chart) already conveys "astronomical night starts here".
    const depthY = yOf(-18).toFixed(1);
    const depthSvg = minAlt < -18
        ? `<line class="sun-chart-depth" x1="${plotL}" x2="${plotR}" y1="${depthY}" y2="${depthY}"/>`
        : '';

    const axisSvg = [0, 0.25, 0.5, 0.75, 1]
        .map((f) => {
            const x = (plotL + f * plotW).toFixed(1);
            const label = f === 1 ? '24:00' : fmtTime(new Date(startMs + f * (endMs - startMs)).toISOString());
            const anchor = f === 0 ? 'start' : f === 1 ? 'end' : 'middle';
            return `<text class="sun-chart-text dim" x="${x}" y="${H - 8}" text-anchor="${anchor}">${label}</text>`;
        })
        .join('');

    // Rise / set: hollow circles on the horizon (hidden in polar conditions
    // via null times — same convention as the card markers).
    const horizonEvent = (iso) => {
        if (!iso) return '';
        const ms = Date.parse(iso);
        if (isNaN(ms)) return '';
        const x = xOf(ms);
        return `<circle class="sun-chart-event" cx="${x.toFixed(1)}" cy="${horizonY.toFixed(1)}" r="4"/>
                <text class="sun-chart-text" x="${clampLabelX(x).toFixed(1)}" y="${(horizonY + 16).toFixed(1)}" text-anchor="middle">${fmtTime(iso)}</text>`;
    };

    let noonSvg = '';
    chart.peakAnchor = null;
    if (sun.solarNoon?.time && sun.solarNoon.alt != null) {
        const x = xOf(Date.parse(sun.solarNoon.time));
        const y = yOf(sun.solarNoon.alt);
        chart.peakAnchor = { x, y };
        noonSvg = `<circle class="sun-chart-peak" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5"/>`;
    }

    const ariaParts = ['Sun altitude chart.'];
    if (sun.rise && sun.set) {
        ariaParts.push(`Sunrise ${fmtTime(sun.rise)}, sunset ${fmtTime(sun.set)}.`);
    }
    if (chart.peakAnchor) {
        ariaParts.push(`Solar noon ${fmtTime(sun.solarNoon.time)} at ${sun.solarNoon.alt.toFixed(1)}°.`);
    }
    chart.ariaBase = ariaParts.join(' ');
    const ariaLabel = chart.ariaBase;

    container.innerHTML = `
        <svg class="sun-chart-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${ariaLabel}">
            <defs>
                <linearGradient id="sun-modal-grad" gradientUnits="userSpaceOnUse"
                                x1="${plotL}" y1="0" x2="${plotR}" y2="0">${stopsSvg}</linearGradient>
            </defs>
            <g class="sun-chart-area">${fillSegmentsSvg}</g>
            <line class="sun-chart-horizon" x1="${plotL}" x2="${plotR}" y1="${horizonY.toFixed(1)}" y2="${horizonY.toFixed(1)}"/>
            ${depthSvg}
            <path class="sun-chart-line" d="${lineD}" fill="none" stroke="url(#sun-modal-grad)"/>
            ${axisSvg}
            ${horizonEvent(sun.rise)}
            ${horizonEvent(sun.set)}
            ${noonSvg}
            <g class="sun-chart-cursor" visibility="hidden">
                <line y1="${plotT}" y2="${plotB}" x1="0" x2="0"/>
                <circle r="3.5" cx="0" cy="0"/>
            </g>
            <g class="sun-chart-now" visibility="hidden">
                <circle class="sun-chart-now-halo" r="9"/>
                <circle class="sun-chart-now-dot" r="4.5"/>
            </g>
        </svg>`;

    const svg = container.querySelector('svg');
    chart.els = {
        svg,
        cursor:     svg.querySelector('.sun-chart-cursor'),
        cursorLine: svg.querySelector('.sun-chart-cursor line'),
        cursorDot:  svg.querySelector('.sun-chart-cursor circle'),
        now:        svg.querySelector('.sun-chart-now'),
        nowHalo:    svg.querySelector('.sun-chart-now-halo'),
        nowDot:     svg.querySelector('.sun-chart-now-dot'),
        peakChip:   null,
        nowChip:    null,
    };

    // Label chips are built as live DOM (not template strings) because they
    // need getBBox() measurement to size their pills.
    if (chart.peakAnchor) {
        chart.els.peakChip = makeChip(svg, 'peak');
        chart.els.peakChip.text.textContent =
            `${fmtTime(sun.solarNoon.time)} · ${sun.solarNoon.alt.toFixed(1)}°`;
        sizeChip(chart.els.peakChip, plotW);
    }
    chart.els.nowChip = makeChip(svg, 'now');

    attachScrub(svg);
    positionNowMarker();
}

function positionNowMarker() {
    if (!chart?.els) return;
    const { now, nowHalo, nowDot, nowChip, svg } = chart.els;
    const alt = chart.currentAltitude;
    if (alt == null) {
        now.setAttribute('visibility', 'hidden');
        chart.nowAnchor = null;
        layoutChips();
        return;
    }
    const { startMs, endMs, plotW, xOf, yOf } = chart.scale;
    const nowMs = Math.max(startMs, Math.min(endMs, Date.now()));
    const x = xOf(nowMs);
    const y = yOf(alt);

    for (const dot of [nowHalo, nowDot]) {
        dot.setAttribute('cx', x.toFixed(1));
        dot.setAttribute('cy', y.toFixed(1));
    }
    now.setAttribute('visibility', 'visible');

    // Altitude only in the chip — the timestamp is redundant with the page
    // clock and the dot's own x-position (it stays in the aria label below).
    // Re-measure, then re-lay-out against the peak chip.
    chart.nowAnchor = { x, y };
    if (nowChip) {
        nowChip.text.querySelector('.sun-chip-val').textContent = `· ${fmtAlt(alt)}`;
        sizeChip(nowChip, plotW);
    }
    layoutChips();

    svg.setAttribute(
        'aria-label',
        `${chart.ariaBase} Current altitude ${fmtAlt(alt)} at ${fmtTime(new Date(nowMs).toISOString())}.`,
    );
}

// ==========================================
// SCRUBBING
// ==========================================

function attachScrub(svg) {
    const queue = (clientX) => {
        chart.pendingScrubX = clientX;
        if (chart.scrubRaf) return;
        chart.scrubRaf = requestAnimationFrame(() => {
            if (!chart) return;
            chart.scrubRaf = null;
            applyScrub();
        });
    };

    svg.addEventListener('pointermove', (e) => queue(e.clientX));
    svg.addEventListener('pointerdown', (e) => {
        // Capture so a touch drag keeps scrubbing outside the SVG bounds.
        try { svg.setPointerCapture(e.pointerId); } catch { /* no-op */ }
        queue(e.clientX);
    });
    svg.addEventListener('pointerup', (e) => {
        // Mouse users keep the hover cursor after a click; touch clears.
        if (e.pointerType !== 'mouse') hideScrub();
    });
    svg.addEventListener('pointercancel', hideScrub);
    svg.addEventListener('pointerleave', hideScrub);
}

function applyScrub() {
    if (!chart?.els) return;
    const { points, scale, els } = chart;
    const rect = els.svg.getBoundingClientRect();
    if (!rect.width) return;
    // ViewBox units equal CSS pixels at render width, so the pointer offset
    // maps straight into chart coordinates.
    const frac = clamp01((chart.pendingScrubX - rect.left - scale.plotL) / scale.plotW);
    // Curve points are uniformly spaced in time — snap by index.
    const point = points[Math.round(frac * (points.length - 1))];
    const x = scale.xOf(Date.parse(point.time));
    const y = scale.yOf(point.altitude);

    els.cursorLine.setAttribute('x1', x.toFixed(1));
    els.cursorLine.setAttribute('x2', x.toFixed(1));
    els.cursorDot.setAttribute('cx', x.toFixed(1));
    els.cursorDot.setAttribute('cy', y.toFixed(1));
    els.cursor.setAttribute('visibility', 'visible');

    const readout = document.getElementById('sun-chart-readout');
    if (readout) readout.textContent = `${fmtTime(point.time)} · ${fmtAlt(point.altitude)}`;
}

function hideScrub() {
    if (!chart?.els) return;
    chart.els.cursor.setAttribute('visibility', 'hidden');
    const readout = document.getElementById('sun-chart-readout');
    if (readout) readout.textContent = '';
}
