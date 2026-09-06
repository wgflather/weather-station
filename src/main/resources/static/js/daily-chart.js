/* =========================================================
   DAILY CHART
   Multi-day aggregated weather data (7 / 14 / 30 day history views).

   What it draws, and why:
   - A shaded band per day between the recorded min and max, coloured by value
     from the metric's own COLOR_SCALES ramp. The band is the FULL day's envelope
     and does not depend on the All day *line* being drawn — under the default
     period sets that line is usually hidden, and the band is what represents the
     whole day.
   - One average line per visible period. Which periods are visible by default is
     per metric — see DEFAULT_PERIODS.
   - Straight segments (tension: 0) — honest, no smoothing. One point per day; a
     spline would draw plausible-looking intermediate days that were never
     measured. The 24-hour chart smooths because it samples a continuous signal
     every few minutes; this one must not.
   - The only annotation is the range's highest and lowest RECORDED value, on the
     band edges. The average lines carry no markers: an "H" on an average line
     while the band reaches higher is a label that reads as "highest" while
     pointing at something that is not.

   Colour comes from chart-metrics.js, shared with the 24-hour chart, so the same
   metric reads the same on both. This module holds no hex values of its own.
   Chart.js must be loaded globally.
========================================================= */

import { getTooltipEl, setTooltipContent } from './chart-tooltip.js';
import { unitFor } from './metric-units.js';
import {
    COLOR_SCALES, METRIC_CONFIG, scaleToRgbString, createDynamicGradient, clampAxisBounds,
} from './chart-metrics.js';

// ── Per-metric identity colour ────────────────────────────────────────────────
// Where METRIC_CONFIG.lineColor is set (pressure, humidity) the 24-hour chart already
// has a flat colour for the metric and this chart borrows it verbatim. Where it is null
// (temperature, surfaceWetness) that chart uses the value gradient and has no single
// colour to lend, so one is pinned to a STOP on the metric's own scale — in family by
// construction. It must not be derived from the range's average: wetness averages ~1.5 %,
// whose stop is near-white, so a mean-derived colour turns the wetness chart white and
// loses the teal that distinguishes it from humidity.
const IDENTITY_STOP = {
    temperature:    25,
    pressure:       1013,
    humidity:       60,
    surfaceWetness: 40,
};

// ── Period series ─────────────────────────────────────────────────────────────
// Daylight and Night keep the sun/moon accents the dashboard uses elsewhere, so they
// read the same here as on the sky cards. All day is deliberately NEUTRAL rather than
// the metric's colour: with the other two anchored to amber and indigo, a metric-derived
// All day collides — orange against Daylight's amber on temperature, and on pressure the
// old violet was nearly indistinguishable from Night's indigo. Neutral cannot collide
// with anything, and the band behind it carries the metric identity instead.
const NEUTRAL = '#f1f5f9';

const PERIOD_STYLE = {
    fullDay: { label: 'All day',  color: NEUTRAL,   primary: true  },
    day:     { label: 'Daylight', color: '#fbbf24', primary: false },
    night:   { label: 'Night',    color: '#818cf8', primary: false },
};

// ── Which periods a metric shows unless the reader says otherwise ─────────────
// Measured over 30 days of this station's own rows, comparing the mean |day − night|
// gap against the day-to-day movement of the whole-day mean:
//
//   temperature 2.63x · humidity 3.35x · surfaceWetness 1.00x · pressure 0.36x
//
// Pressure has no diurnal cycle worth splitting on — its two period lines sit on top of
// each other and add nothing, so it shows All day alone. Wetness looks borderline on that
// ratio and is not: it is flat for 27 days a month and then one night runs 10–25 pp wetter
// than its day, which is dew and is the whole reason the sensor is there. A mean is the
// wrong summary of a signal that bimodal, so wetness keeps the split.
export const DEFAULT_PERIODS = {
    temperature:    ['day', 'night'],
    humidity:       ['day', 'night'],
    surfaceWetness: ['day', 'night'],
    pressure:       ['fullDay'],
};

// ── Visual density ────────────────────────────────────────────────────────────
// The band is context and the lines are the subject, so the band sits clearly behind
// them. These values are deliberately quieter than the 24-hour chart's: that one lifts a
// single line off an empty canvas, this one already has a band and up to three lines.
const BAND_FILL_ALPHA  = 0.16;
const BAND_EDGE_ALPHA  = 0.45;
const BAND_EDGE_WIDTH  = 0.8;
const GLOW_BLUR        = 7;
const PRIMARY_WIDTH    = 2.2;
const SECONDARY_WIDTH  = 1.6;
const DOTS_MAX_DAYS    = 14;

/**
 * Colour of one period's line for a metric. Exported so the modal's legend swatches and
 * period rows key off the same table the chart draws from, instead of a second copy of
 * these values in CSS. It no longer varies by metric — All day is neutral and the other
 * two are fixed accents — but the signature is kept so callers need not change.
 */
export function periodColor(period) {
    return PERIOD_STYLE[period]?.color ?? NEUTRAL;
}

/** The metric's identity colour: the 24-hour chart's own, or its pinned scale stop. */
function identityColor(metric, alpha = 1) {
    const flat = METRIC_CONFIG[metric]?.lineColor;
    if (flat) {
        const [r, g, b] = flat.replace(/^#/, '').match(/../g).map(h => parseInt(h, 16));
        return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : flat;
    }
    return scaleToRgbString(COLOR_SCALES[metric], IDENTITY_STOP[metric], alpha);
}

// ── External tooltip handler ──────────────────────────────────────────────────
function makeTooltipHandler(minPoints, maxPoints, unit) {
    return function dailyTooltip(context) {
        const { chart, tooltip } = context;
        const el = getTooltipEl();

        if (tooltip.opacity === 0) {
            el.style.opacity = '0';
            return;
        }

        // One entry per visible period — with several series drawn, showing only the
        // first would silently hide the comparison the periods exist to make.
        const points = (tooltip.dataPoints ?? []).filter(p => !p.dataset.label.startsWith('__'));
        if (!points.length) { el.style.opacity = '0'; return; }

        const i    = points[0].dataIndex;
        const date = new Date(points[0].raw.x);

        const title = date.toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric',
        });

        const rows = points.map(p =>
            `<div style="color:#e2e8f0">` +
            `<span style="color:${p.dataset.swatch};font-weight:700">${p.raw.y.toFixed(1)}${unit}</span>` +
            ` ${p.dataset.label.toLowerCase()}</div>`);

        // The band's own numbers. This is where the recorded high and low for a single
        // day are readable — the band shows that a day swung, not by how much.
        const minV = minPoints[i]?.y != null ? minPoints[i].y.toFixed(1) : '–';
        const maxV = maxPoints[i]?.y != null ? maxPoints[i].y.toFixed(1) : '–';
        if (minPoints[i]?.y != null || maxPoints[i]?.y != null) {
            rows.push(`<div style="font-size:10.5px;color:rgba(148,163,184,0.8);margin-top:3px">` +
                      `Recorded ${minV} – ${maxV}${unit}</div>`);
        }

        setTooltipContent(el, [title], [{ html: rows.join('') }]);

        // Position relative to viewport (tooltip is position: fixed).
        const rect = chart.canvas.getBoundingClientRect();
        const cx   = rect.left + tooltip.caretX;
        const cy   = rect.top  + tooltip.caretY;

        el.style.opacity = '1';
        el.style.left    = `${cx + 14}px`;
        el.style.top     = `${cy - 32}px`;

        // Clamp on next frame when dimensions are known.
        requestAnimationFrame(() => {
            const er = el.getBoundingClientRect();
            if (er.right  > window.innerWidth  - 8) el.style.left = `${cx - er.width - 14}px`;
            if (er.top    < 8)                       el.style.top  = `${cy + 14}px`;
            if (er.bottom > window.innerHeight - 8)  el.style.top  = `${cy - er.height - 6}px`;
        });
    };
}

// ── Range extremes plugin ─────────────────────────────────────────────────────
/**
 * The highest and lowest values RECORDED anywhere in the range, marked on the band edge
 * they belong to and labelled with the number.
 *
 * This is the chart's only annotation. It replaces the H / L letters that used to sit on
 * the All day average line, which marked a different and weaker fact — the day with the
 * highest daily *mean* — while the band above it visibly reached higher. Two "highests"
 * in two visual languages, and the louder one was the smaller number.
 *
 * Dataset 0 is the band's top edge and dataset 1 its bottom; the caller guarantees that
 * ordering, and the plugin is only installed when the band is drawn.
 */
function makeRangeExtremesPlugin(minPoints, maxPoints, unit, colors, isMobile) {
    return {
        id: 'dailyRangeExtremes',
        afterDatasetsDraw(chart) {
            const top = chart.getDatasetMeta(0);
            const bot = chart.getDatasetMeta(1);
            if (!top?.data?.length || !bot?.data?.length) return;

            let hiI = -1, loI = -1, hiV = -Infinity, loV = Infinity;
            maxPoints.forEach((p, i) => { if (p.y != null && p.y > hiV) { hiV = p.y; hiI = i; } });
            minPoints.forEach((p, i) => { if (p.y != null && p.y < loV) { loV = p.y; loI = i; } });
            if (hiI === -1 || loI === -1) return;

            const { ctx, chartArea } = chart;
            const offset = isMobile ? 9 : 11;

            ctx.save();
            ctx.font         = `600 ${isMobile ? 9 : 9.5}px Figtree, sans-serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';

            for (const [meta, idx, value, color, dy] of [
                [top, hiI, hiV, colors.high, -offset],
                [bot, loI, loV, colors.low,   offset],
            ]) {
                const pt = meta.data[idx];
                if (!pt) continue;
                const y = Math.max(chartArea.top + 8, Math.min(chartArea.bottom - 8, pt.y + dy));

                // A tick joining label to band edge, so the number reads as belonging to
                // that edge rather than floating over the plot.
                ctx.strokeStyle = color;
                ctx.globalAlpha = 0.28;
                ctx.beginPath();
                ctx.moveTo(pt.x, pt.y);
                ctx.lineTo(pt.x, y + (dy < 0 ? 5 : -5));
                ctx.stroke();

                ctx.globalAlpha = 0.8;
                ctx.fillStyle   = color;
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillText(`${value.toFixed(1)}${unit}`, pt.x, y);
            }

            ctx.restore();
        },
    };
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Render (or re-render) a daily aggregated chart on `canvasId`.
 * @param {Array<{date: string, fullDay: object, day: object, night: object}>} summaries
 *        Array from /api/weather/history/daily — periods still nested.
 * @param {string} metric  Metric request key, e.g. 'temperature'
 * @param {string} canvasId  ID of the <canvas> element
 * @param {string} fromStr  First day of the requested range "YYYY-MM-DD"
 * @param {string} toStr    Last day of the requested range  "YYYY-MM-DD"
 * @param {string[]} [periods]  Period keys to draw, in draw order.
 */
export function renderDailyChart(summaries, metric, canvasId, fromStr, toStr,
                                 periods = DEFAULT_PERIODS[metric] ?? ['fullDay']) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !summaries.length || !periods.length) return;

    // Destroy any existing chart on this canvas, from any module.
    Chart.getChart(canvas)?.destroy();

    const scale    = COLOR_SCALES[metric] ?? COLOR_SCALES.temperature;
    const mcfg     = METRIC_CONFIG[metric] ?? METRIC_CONFIG.temperature;
    const unit     = unitFor(metric);
    const isMobile = window.innerWidth <= 480;

    function pad2(n) { return String(n).padStart(2, '0'); }

    // ── Build point arrays covering the FULL requested range ──
    // Days with no data get y: null so gaps appear in the line.
    const dataMap = new Map(summaries.map(s => [s.date, s]));
    const dates   = [];

    const cursor   = new Date(fromStr + 'T00:00:00');
    const rangeEnd = new Date(toStr   + 'T00:00:00');

    while (cursor <= rangeEnd) {
        const key = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(cursor.getDate())}`;
        dates.push({ key, date: new Date(cursor) });
        cursor.setDate(cursor.getDate() + 1);
    }

    /** Points for one period's `field` across the range, null where that day has no block. */
    const seriesFor = (period, field) => dates.map(({ key, date }) => {
        const block = dataMap.get(key)?.[period];
        return { x: date, y: block ? (block[metric + field] ?? null) : null };
    });

    // The band is the FULL day's envelope, whether or not the All day line is drawn.
    const minPoints = seriesFor('fullDay', 'Min');
    const maxPoints = seriesFor('fullDay', 'Max');
    const hasBand   = [...minPoints, ...maxPoints].some(p => p.y != null);

    // ── Series, one per visible period ─────────────────────
    const series = periods
        .filter(period => PERIOD_STYLE[period])
        .map(period => ({
            period,
            style:  PERIOD_STYLE[period],
            points: seriesFor(period, 'Avg'),
        }))
        .filter(s => s.points.some(p => p.y != null));

    if (!series.length && !hasBand) return;

    // ── Datasets ───────────────────────────────────────────
    const datasets = [];

    if (hasBand) {
        // Value-coloured, so a height on this chart means the same colour it does on the
        // 24-hour chart: red at 40 °C, pale at 7 °C. A flat tint cannot say that, and a
        // band spanning half the axis in one colour is the thing that made this look
        // decorative rather than measured.
        const bandFill = (context) => {
            const { chartArea, scales } = context.chart;
            if (!chartArea) return 'rgba(0,0,0,0)';
            return createDynamicGradient(context.chart.ctx, chartArea, scales.y, scale, BAND_FILL_ALPHA);
        };
        const bandEdge = (context) => {
            const { chartArea, scales } = context.chart;
            if (!chartArea) return identityColor(metric, BAND_EDGE_ALPHA);
            return createDynamicGradient(context.chart.ctx, chartArea, scales.y, scale, BAND_EDGE_ALPHA);
        };

        // Edge strokes are not decoration: at borderWidth 0 the min and max are the
        // boundary of a shape rather than data, and nothing says they are series at all.
        datasets.push({
            label:            '__bandTop__',
            data:             maxPoints,
            fill:             '+1',
            tension:          0,
            spanGaps:         false,
            borderWidth:      BAND_EDGE_WIDTH,
            borderColor:      bandEdge,
            backgroundColor:  bandFill,
            pointRadius:      0,
            pointHoverRadius: 0,
            order:            20,
        });
        datasets.push({
            label:            '__bandBottom__',
            data:             minPoints,
            fill:             false,
            tension:          0,
            spanGaps:         false,
            borderWidth:      BAND_EDGE_WIDTH,
            borderColor:      bandEdge,
            pointRadius:      0,
            pointHoverRadius: 0,
            order:            20,
        });
    }

    const showDots = dates.length <= DOTS_MAX_DAYS;

    for (const { period, style, points } of series) {
        datasets.push({
            label:           style.label,
            periodKey:       period,
            swatch:          style.color,
            data:            points,
            fill:            false,
            tension:         0,
            spanGaps:        false,
            borderWidth:     style.primary ? PRIMARY_WIDTH : SECONDARY_WIDTH,
            borderColor:     style.color,
            borderCapStyle:  'round',
            borderJoinStyle: 'round',
            // Dots say "these are discrete days", which is worth saying at a week and is
            // noise at a month — 30 days times three series is 90 markers.
            pointRadius:          (ctx) =>
                points[ctx.dataIndex]?.y == null ? 0 : (showDots ? (isMobile ? 2.4 : 2.8) : 0),
            pointHoverRadius:     (ctx) => (points[ctx.dataIndex]?.y != null ? 6 : 0),
            pointBackgroundColor: style.color,
            pointBorderWidth:     0,
            order:                style.primary ? 1 : 3,
        });
    }

    // Dashed gap line — connects known points across missing days. spanGaps: true draws
    // through nulls; the solid avg lines hide it where consecutive data exists (lower
    // order draws on top). Tied to the first drawn series so it appears whichever
    // periods are visible.
    if (series.length) {
        datasets.push({
            label:            '__gap__',
            data:             series[0].points,
            spanGaps:         true,
            fill:             false,
            tension:          0,
            borderWidth:      1.5,
            borderDash:       [4, 4],
            borderColor:      'rgba(148, 163, 184, 0.28)',
            pointRadius:      0,
            pointHoverRadius: 0,
            order:            4,
        });
    }

    // ── Y-axis bounds — across every drawn series AND the band, or one clips ──
    const allY = series.flatMap(s => s.points.map(p => p.y))
        .concat(hasBand ? [...minPoints, ...maxPoints].map(p => p.y) : [])
        .filter(v => v != null);
    const dataMin = Math.min(...allY);
    const dataMax = Math.max(...allY);
    // Less headroom when the band is drawn — it already supplies the vertical mass, and
    // 20 % on top of it would squash the lines into the middle third of the plot.
    const pad = Math.max((dataMax - dataMin) * (hasBand ? 0.10 : 0.20), 1);

    // The band makes this worse than on the 24-hour chart: it widens the range the padding
    // is a fraction of, so a wetness month that is dry except for three dew nights pads far
    // below zero and the axis rounds out to -10 %.
    const yBounds = clampAxisBounds(metric, dataMin, dataMax, dataMin - pad, dataMax + pad);

    // ── X-axis bounds — full requested range, ±12 h padding ──
    const HALF_DAY = 12 * 60 * 60 * 1000;
    const xMin = new Date(new Date(fromStr + 'T00:00:00').getTime() - HALF_DAY);
    const xMax = new Date(new Date(toStr   + 'T00:00:00').getTime() + HALF_DAY);

    const totalDays = dates.length;
    const xStep = totalDays <= 8 ? 1 : totalDays <= 16 ? 2 : 5;

    // Glow only where there is a single dominant line to lift. With Daylight and Night
    // drawn there is no primary, and glowing both just fogs the plot.
    const primaryIdx = datasets.findIndex(d => d.periodKey === 'fullDay');

    // ── Build Chart ────────────────────────────────────────
    const plugins = [];

    if (primaryIdx !== -1) {
        plugins.push({
            id: 'dailyPrimaryGlow',
            beforeDatasetDraw(chart, args) {
                if (args.index !== primaryIdx) return;
                const { ctx } = chart;
                ctx.save();
                ctx.shadowColor   = mcfg.shadowColor;
                ctx.shadowBlur    = GLOW_BLUR;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            },
            afterDatasetDraw(chart, args) {
                if (args.index !== primaryIdx) return;
                chart.ctx.restore();
            },
        });
    }

    if (hasBand) {
        plugins.push(makeRangeExtremesPlugin(
            minPoints, maxPoints, unit,
            { high: mcfg.maxNodeColor, low: mcfg.minNodeColor },
            isMobile));
    }

    new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: { datasets },
        options: {
            responsive:          true,
            maintainAspectRatio: false,
            animation:           { duration: 220, easing: 'easeOutQuart' },
            interaction:         { intersect: false, mode: 'index' },

            scales: {
                x: {
                    type: 'time',
                    min:  xMin,
                    max:  xMax,
                    time: {
                        unit:           'day',
                        displayFormats: { day: 'MMM d' },
                    },
                    ticks: {
                        stepSize:    xStep,
                        color:       'rgba(148, 163, 184, 0.6)',
                        font:        { size: isMobile ? 9 : 11 },
                        maxRotation: 0,
                    },
                    grid:   { color: 'rgba(255,255,255,0.028)', drawBorder: false },
                    border: { display: false },
                },
                y: {
                    ...yBounds,
                    ticks: {
                        color:    'rgba(148, 163, 184, 0.6)',
                        font:     { size: isMobile ? 9 : 11 },
                        callback: (v) => `${v}${unit}`,
                    },
                    grid:   { color: 'rgba(255,255,255,0.035)', drawBorder: false },
                    border: { display: false },
                },
            },

            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled:  false,
                    external: makeTooltipHandler(minPoints, maxPoints, unit),
                    filter: (item) => item.raw?.y != null && !item.dataset.label.startsWith('__'),
                },
            },
        },

        plugins,
    });
}
