// sun-curve.js
//
// The sun card's daily-arc SVG (curve, rise/set/noon markers, the lit "now"
// marker) and the rise/set countdown heroes for both sun and moon.
//
// Self-contained: it renders from the values it is handed and holds no
// dashboard state. The altitude -> y geometry comes from sky-colors.js so the
// card and the sun modal chart plot the same shape.

import { altitudeCurveY, sunAppearanceAt, sunEventMarkerColor, rgbString, rgbaString } from './sky-colors.js';
import { formatTimeOfDay, formatDuration } from './time-format.js';

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
    return altitudeCurveY(altDeg, {
        maxAlt,
        minAlt,
        horizonY:     CURVE_HORIZON_Y,
        aboveExtent:  CURVE_HORIZON_Y * CURVE_ABOVE_PADDING,
        belowExtent: (CURVE_H_VB - CURVE_HORIZON_Y) * CURVE_BELOW_PADDING,
    });
}

function timeToXPercent(isoTime, startMs, endMs) {
    const ms = new Date(isoTime).getTime();
    return Math.max(0, Math.min(100, ((ms - startMs) / (endMs - startMs)) * 100));
}

export function renderSunCurve(sun) {
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

    // One flat colour across the dot: the sun's own apparent colour at this
    // event's altitude, desaturated and darkened so it stays a quiet
    // reference point — the full-saturation sun belongs to the "now" marker.
    marker.style.background = sunEventMarkerColor(altitudeDeg);

    // Label sits LABEL_OFFSET_PX below the marker's centre. The tick
    // ::before pseudo-element bridges the gap visually.
    label.style.display = '';
    label.textContent   = formatTimeOfDay(isoTime);
    label.style.left    = `${xPercent}%`;
    label.style.top     = `${yPx + LABEL_OFFSET_PX}px`;
}

export function updateSunNowMarker(currentAltitude) {
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

    applySunMarkerAppearance(el, currentAltitude);
}

/**
 * Paints the card's "now" marker as a miniature sun. The layered colour
 * model lives in sky-colors.js (sunAppearanceAt) so the sun modal chart
 * renders the identical object from the same numbers; this just maps those
 * values onto the CSS custom properties the marker's styles read.
 */
function applySunMarkerAppearance(el, altitude) {
    const a = sunAppearanceAt(altitude);

    // Disc: bright pale centre → core → halo colour at the rim. The rim
    // softens as the sun drops so it melts into the glow rather than ending
    // on a hard circle.
    el.style.setProperty('--now-centre',    rgbString(a.centre));
    el.style.setProperty('--now-core',      rgbString(a.core));
    el.style.setProperty('--now-halo',      rgbString(a.halo));
    el.style.setProperty('--now-edge',      rgbaString(a.halo, a.edgeAlpha));
    el.style.setProperty('--now-edge-stop', `${a.edgeStopPct.toFixed(0)}%`);
    el.style.setProperty('--now-highlight', rgbaString([255, 255, 255], a.highlightAlpha));

    // Halo/bloom: radii fixed so the layered structure stays constant; only
    // colour and opacity move with altitude. Inner halo ≈ 18px, bloom ≈ 30px
    // around the 10px disc, fading to nothing with no visible boundary.
    el.style.setProperty('--now-glow-inner-color', rgbaString(a.halo,  a.glowInnerAlpha));
    el.style.setProperty('--now-glow-mid-color',   rgbaString(a.bloom, a.glowMidAlpha));
    el.style.setProperty('--now-glow-outer-color', rgbaString(a.bloom, a.glowOuterAlpha));

    // Spikes inherit the inner-halo colour, so they warm with the atmosphere.
    el.style.setProperty('--now-spike',         rgbString(a.halo));
    el.style.setProperty('--now-spike-opacity', a.spikeAlpha.toFixed(2));
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

export function updateSunHero(riseIso, setIso, dayLengthSeconds) {
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

export function updateMoonCountdown(riseIso, setIso, currentAltitude) {
    const el = document.getElementById('moon-hero-event');
    if (!el) return;

    const next = pickNextEvent(riseIso, setIso, 'Moon');
    if (next) {
        el.textContent = `${next.label} in ${formatCountdown(next.timeMs)}`;
        return;
    }

    // No event left today. Two ways to land here, and the live altitude — not
    // the exhausted event list — answers both:
    //   - circumpolar: no rise or set at all inside this 24h window;
    //   - both events already past. Daily events are per calendar day, so a
    //     moon that rises in the evening has its set stamped for *tomorrow*
    //     and today's payload pairs that rise with the previous night's set.
    //     An empty candidate list therefore means "not in today's events",
    //     never "down" — a moon that rose at 19:19 is plainly up at 22:21.
    const isUp   = (currentAltitude ?? 0) > 0;
    const allDay = riseIso == null && setIso == null;
    el.textContent = isUp
        ? (allDay ? 'Above horizon all day' : 'Above horizon')
        : (allDay ? 'Below horizon all day' : 'Below horizon');
}

