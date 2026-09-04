/* =========================================================
   DAILY CHART
   Renders multi-day aggregated weather data (7 / 14 / 30 day
   history views). Designed for analytical readability:
   - Straight line segments (tension: 0) — honest, no smoothing
   - Visible dot markers on every data point
   - One average line per visible period (All day / Daylight / Night)
   - Highlighted markers + H / L labels for the All day high/low
   - Tooltips show every visible period plus the All day daily range
   Chart.js and its date-fns adapter must be loaded globally.
========================================================= */

import { getTooltipEl, setTooltipContent } from './chart-tooltip.js';
import { unitFor } from './metric-units.js';

// ── Metric configuration ──────────────────────────────────────────────────────
const DAILY_CFG = {
    temperature: {
        label:     'Temperature',
        unit:      unitFor('temperature'),
        lineColor: '#7dd3fc',
        highColor: '#fb923c',
        lowColor:  '#38bdf8',
    },
    pressure: {
        label:     'Pressure',
        unit:      unitFor('pressure'),
        lineColor: '#a78bfa',
        highColor: '#c084fc',
        lowColor:  '#818cf8',
    },
    humidity: {
        label:     'Humidity',
        unit:      unitFor('humidity'),
        lineColor: '#34d399',
        highColor: '#6ee7b7',
        lowColor:  '#059669',
    },
};

// ── Period series ─────────────────────────────────────────────────────────────
// All day borrows the metric's own colour because it is the series this chart has
// always drawn; daylight and night take the sun/moon accents the dashboard already
// uses elsewhere, so they read the same way here as they do on the sky cards.
const PERIOD_STYLE = {
    fullDay: { label: 'All day',  color: null,      width: 2.2 },
    day:     { label: 'Daylight', color: '#fbbf24', width: 1.6 },
    night:   { label: 'Night',    color: '#818cf8', width: 1.6 },
};

/**
 * Colour of one period's line for a metric — All day resolves to the metric's own
 * colour. Exported so the breakdown rows can key their swatches off the same table
 * the chart draws from, instead of a second copy of these hex values in CSS.
 */
export function periodColor(period, metric) {
    const cfg = DAILY_CFG[metric] ?? DAILY_CFG.temperature;
    return PERIOD_STYLE[period]?.color ?? cfg.lineColor;
}

// ── External tooltip handler ──────────────────────────────────────────────────
function makeTooltipHandler(minPoints, maxPoints, cfg, minIdx, maxIdx) {
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

        const rows = points.map(p => {
            const badge = p.dataset.periodKey !== 'fullDay' ? ''
                : p.dataIndex === maxIdx ? `<span style="color:#fb923c;font-size:10px;font-weight:600"> · Period High</span>`
                : p.dataIndex === minIdx ? `<span style="color:#38bdf8;font-size:10px;font-weight:600"> · Period Low</span>`
                : '';
            return `<div style="color:#e2e8f0">` +
                   `<span style="color:${p.dataset.borderColor};font-weight:700">${p.raw.y.toFixed(1)}${cfg.unit}</span>` +
                   ` ${p.dataset.label.toLowerCase()}${badge}</div>`;
        });

        // The daily range belongs to All day; it is the only series with min/max behind it.
        const minV = minPoints[i]?.y != null ? minPoints[i].y.toFixed(1) : '–';
        const maxV = maxPoints[i]?.y != null ? maxPoints[i].y.toFixed(1) : '–';
        if (minPoints[i]?.y != null || maxPoints[i]?.y != null) {
            rows.push(`<div style="font-size:10.5px;color:rgba(148,163,184,0.8);margin-top:3px">` +
                      ` Range ${minV} – ${maxV}${cfg.unit}</div>`);
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

// ── H / L canvas labels plugin ────────────────────────────────────────────────
function makeHLPlugin(minIdx, maxIdx, cfg, isMobile, fullDayIdx) {
    return {
        id: 'dailyHL',
        afterDatasetsDraw(chart) {
            // H / L mark the All day series' own extremes, so they are drawn only when
            // that series is on the chart — against Daylight alone they would mislead.
            if (minIdx === -1 || maxIdx === -1 || fullDayIdx === -1) return;

            const meta = chart.getDatasetMeta(fullDayIdx);
            if (!meta?.data?.length) return;

            const { ctx, chartArea } = chart;
            const markerR = isMobile ? 5 : 6;
            const vPad    = markerR + 5;
            const fSize   = isMobile ? 8 : 9;

            ctx.save();
            ctx.font         = `700 ${fSize}px Figtree, sans-serif`;
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.globalAlpha  = 0.88;

            const items = [
                { idx: maxIdx, letter: 'H', color: cfg.highColor, above: true  },
                { idx: minIdx, letter: 'L', color: cfg.lowColor,  above: false },
            ];

            for (const { idx, letter, color, above } of items) {
                const pt = meta.data[idx];
                if (!pt) continue;
                let y = pt.y + (above ? -vPad : vPad);
                y = Math.max(chartArea.top + 6, Math.min(chartArea.bottom - 6, y));
                ctx.fillStyle = color;
                ctx.fillText(letter, pt.x, y);
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
 * @param {'temperature'|'pressure'|'humidity'} metric
 * @param {string} canvasId  ID of the <canvas> element
 * @param {string} fromStr  First day of the requested range "YYYY-MM-DD"
 * @param {string} toStr    Last day of the requested range  "YYYY-MM-DD"
 * @param {string[]} [periods]  Period keys to draw, in draw order. Defaults to All day alone.
 */
export function renderDailyChart(summaries, metric, canvasId, fromStr, toStr, periods = ['fullDay']) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !summaries.length || !periods.length) return;

    // Destroy any existing chart on this canvas, from any module.
    Chart.getChart(canvas)?.destroy();

    const cfg      = DAILY_CFG[metric] ?? DAILY_CFG.temperature;
    const isMobile = window.innerWidth <= 480;

    function pad2(n) { return String(n).padStart(2, '0'); }

    // ── Build point arrays covering the FULL requested range ──
    // Days with no data get y: null so gaps appear in the line.
    const dataMap = new Map(summaries.map(s => [s.date, s]));
    const dates   = [];

    const cursor = new Date(fromStr + 'T00:00:00');
    const rangeEnd = new Date(toStr + 'T00:00:00');

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

    // Min / max and the H / L markers describe All day, the only period with a
    // range behind it on this chart.
    const avgPoints = seriesFor('fullDay', 'Avg');
    const minPoints = seriesFor('fullDay', 'Min');
    const maxPoints = seriesFor('fullDay', 'Max');

    // ── Period high / low (on the All day avg line) ────────
    let minIdx = -1, maxIdx = -1, minVal = Infinity, maxVal = -Infinity;
    for (let i = 0; i < avgPoints.length; i++) {
        const v = avgPoints[i].y;
        if (v == null) continue;
        if (v < minVal) { minVal = v; minIdx = i; }
        if (v > maxVal) { maxVal = v; maxIdx = i; }
    }

    // ── Series, one per visible period ─────────────────────
    const series = periods
        .filter(period => PERIOD_STYLE[period])
        .map(period => ({
            period,
            style:  PERIOD_STYLE[period],
            color:  PERIOD_STYLE[period].color ?? cfg.lineColor,
            points: period === 'fullDay' ? avgPoints : seriesFor(period, 'Avg'),
        }))
        .filter(s => s.points.some(p => p.y != null));

    if (!series.length) return;

    const fullDayIdx = series.findIndex(s => s.period === 'fullDay');

    // ── Y-axis bounds — across every drawn series, or a hidden line clips ──
    const allY    = series.flatMap(s => s.points.map(p => p.y)).filter(v => v != null);
    const dataMin = Math.min(...allY);
    const dataMax = Math.max(...allY);
    const pad     = Math.max((dataMax - dataMin) * 0.20, 1);

    // ── X-axis bounds — full requested range, ±12 h padding ──
    const HALF_DAY  = 12 * 60 * 60 * 1000;
    const xMin = new Date(new Date(fromStr + 'T00:00:00').getTime() - HALF_DAY);
    const xMax = new Date(new Date(toStr   + 'T00:00:00').getTime() + HALF_DAY);

    // Tick density based on total range days
    const totalDays = avgPoints.length;
    const xStep = totalDays <= 8 ? 1 : totalDays <= 16 ? 2 : 5;

    // ── Build Chart ────────────────────────────────────────
    new Chart(canvas.getContext('2d'), {
        type: 'line',
        data: {
            datasets: [
                // One average line per visible period. All day keeps the emphasis it
                // has always had: full stroke width, and the only series carrying the
                // period high / low markers.
                ...series.map(({ period, style, color, points }) => {
                    const isFullDay = period === 'fullDay';
                    const marked = (i) => isFullDay && (i === maxIdx || i === minIdx);

                    return {
                        label:       style.label,
                        periodKey:   period,
                        data:        points,
                        fill:        false,
                        tension:     0,
                        borderWidth: style.width,
                        borderColor: color,
                        spanGaps:    false,

                        pointRadius: (ctx) => {
                            const i = ctx.dataIndex;
                            if (points[i]?.y == null) return 0;
                            if (marked(i)) return isMobile ? 5 : 6;
                            if (!isFullDay) return isMobile ? 2 : 2.5;
                            return isMobile ? 3 : 3.5;
                        },
                        pointHoverRadius:     (ctx) => points[ctx.dataIndex]?.y != null ? 7 : 0,
                        pointBackgroundColor: (ctx) => {
                            const i = ctx.dataIndex;
                            if (i === maxIdx && isFullDay) return cfg.highColor;
                            if (i === minIdx && isFullDay) return cfg.lowColor;
                            return color;
                        },
                        pointBorderColor: (ctx) =>
                            marked(ctx.dataIndex) ? 'rgba(255,255,255,0.55)' : color,
                        pointBorderWidth: (ctx) => (marked(ctx.dataIndex) ? 1.5 : 1),
                        order: isFullDay ? 1 : 3,
                    };
                }),
                // Dashed gap line — connects known points across missing days.
                // spanGaps: true draws through nulls; the solid avg lines hide it
                // where consecutive data exists (lower order draws on top). Tied to
                // the first drawn series so it still appears when All day is hidden.
                {
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
                },
            ],
        },
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
                    suggestedMin: dataMin - pad,
                    suggestedMax: dataMax + pad,
                    ticks: {
                        color:    'rgba(148, 163, 184, 0.6)',
                        font:     { size: isMobile ? 9 : 11 },
                        callback: (v) => `${v}${cfg.unit}`,
                    },
                    grid:   { color: 'rgba(255,255,255,0.035)', drawBorder: false },
                    border: { display: false },
                },
            },

            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled:  false,
                    external: makeTooltipHandler(minPoints, maxPoints, cfg, minIdx, maxIdx),
                    filter: (item) => item.raw?.y != null && !item.dataset.label.startsWith('__'),
                },
            },
        },

        plugins: [makeHLPlugin(minIdx, maxIdx, cfg, isMobile, fullDayIdx)],
    });
}
