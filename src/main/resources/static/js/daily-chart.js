/* =========================================================
   DAILY CHART
   Renders multi-day aggregated weather data (7 / 14 / 30 day
   history views). Designed for analytical readability:
   - Straight line segments (tension: 0) — honest, no smoothing
   - Visible dot markers on every data point
   - Shaded min-max range band showing daily variance
   - Highlighted markers + H / L labels for period high/low
   - Tooltips show avg value + daily range on hover
   Chart.js and its date-fns adapter must be loaded globally.
========================================================= */

// ── Metric configuration ──────────────────────────────────────────────────────
const DAILY_CFG = {
    temperature: {
        label:     'Temperature',
        unit:      '°C',
        lineColor: '#7dd3fc',
        highColor: '#fb923c',
        lowColor:  '#38bdf8',
    },
    pressure: {
        label:     'Pressure',
        unit:      ' hPa',
        lineColor: '#a78bfa',
        highColor: '#c084fc',
        lowColor:  '#818cf8',
    },
    humidity: {
        label:     'Humidity',
        unit:      '%',
        lineColor: '#34d399',
        highColor: '#6ee7b7',
        lowColor:  '#059669',
    },
};

// ── Tooltip element (shared with weather-chart.js) ────────────────────────────
function getTooltipEl() {
    let el = document.getElementById('weather-chart-tooltip');
    if (!el) {
        el = document.createElement('div');
        el.id        = 'weather-chart-tooltip';
        el.className = 'chartjs-tooltip';
        el.innerHTML = '<div class="chartjs-tooltip-title"></div><div class="chartjs-tooltip-body"></div>';
        document.body.appendChild(el);
    }
    return el;
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

        // Only the avg dataset passes the filter — pick its data point.
        const dp = tooltip.dataPoints?.find(p => !p.dataset.label.startsWith('__'));
        if (!dp) { el.style.opacity = '0'; return; }

        const i    = dp.dataIndex;
        const date = new Date(dp.raw.x);
        const avg  = dp.raw.y?.toFixed(1) ?? '–';
        const minV = minPoints[i]?.y != null ? minPoints[i].y.toFixed(1) : '–';
        const maxV = maxPoints[i]?.y != null ? maxPoints[i].y.toFixed(1) : '–';

        const badge =
            i === maxIdx ? `<span style="color:#fb923c;font-size:10px;font-weight:600"> · Period High</span>` :
            i === minIdx ? `<span style="color:#38bdf8;font-size:10px;font-weight:600"> · Period Low</span>`  :
            '';

        const titleEl = el.querySelector('.chartjs-tooltip-title');
        const bodyEl  = el.querySelector('.chartjs-tooltip-body');

        titleEl.textContent = date.toLocaleDateString(undefined, {
            weekday: 'short', month: 'short', day: 'numeric',
        });

        bodyEl.innerHTML =
            `<div style="color:#e2e8f0"> ` +
            `<span style="color:${cfg.lineColor};font-weight:700">${avg}${cfg.unit}</span>` +
            ` avg${badge}</div>` +
            `<div style="font-size:10.5px;color:rgba(148,163,184,0.8);margin-top:3px">` +
            ` Range ${minV} – ${maxV}${cfg.unit}</div>`;

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
function makeHLPlugin(minIdx, maxIdx, cfg, isMobile) {
    return {
        id: 'dailyHL',
        afterDatasetsDraw(chart) {
            if (minIdx === -1 || maxIdx === -1) return;

            // Dataset 0 is the avg line (only dataset).
            const meta = chart.getDatasetMeta(0);
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
 * @param {DailyWeatherRecordDto[]} records  Array from /api/weather/history/daily
 * @param {'temperature'|'pressure'|'humidity'} metric
 * @param {string} canvasId  ID of the <canvas> element
 * @param {string} fromStr  First day of the requested range "YYYY-MM-DD"
 * @param {string} toStr    Last day of the requested range  "YYYY-MM-DD"
 */
export function renderDailyChart(records, metric, canvasId, fromStr, toStr) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !records.length) return;

    // Destroy any existing chart on this canvas, from any module.
    Chart.getChart(canvas)?.destroy();

    const cfg      = DAILY_CFG[metric] ?? DAILY_CFG.temperature;
    const isMobile = window.innerWidth <= 480;

    function pad2(n) { return String(n).padStart(2, '0'); }

    // ── Build point arrays covering the FULL requested range ──
    // Days with no data get y: null so gaps appear in the line.
    const dataMap = new Map(records.map(r => [r.date, r]));
    const avgPoints = [], minPoints = [], maxPoints = [];

    const cursor = new Date(fromStr + 'T00:00:00');
    const rangeEnd = new Date(toStr + 'T00:00:00');

    while (cursor <= rangeEnd) {
        const key = `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}-${pad2(cursor.getDate())}`;
        const r   = dataMap.get(key);
        const d   = new Date(cursor);
        avgPoints.push({ x: d, y: r ? (r[metric + 'Avg'] ?? null) : null });
        minPoints.push({ x: d, y: r ? (r[metric + 'Min'] ?? null) : null });
        maxPoints.push({ x: d, y: r ? (r[metric + 'Max'] ?? null) : null });
        cursor.setDate(cursor.getDate() + 1);
    }

    // ── Period high / low (on avg line) ────────────────────
    let minIdx = -1, maxIdx = -1, minVal = Infinity, maxVal = -Infinity;
    for (let i = 0; i < avgPoints.length; i++) {
        const v = avgPoints[i].y;
        if (v == null) continue;
        if (v < minVal) { minVal = v; minIdx = i; }
        if (v > maxVal) { maxVal = v; maxIdx = i; }
    }

    // ── Y-axis bounds ──────────────────────────────────────
    const allY    = avgPoints.map(p => p.y).filter(v => v != null);
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
                // Daily average line (solid, on top)
                {
                    label:       cfg.label,
                    data:        avgPoints,
                    fill:        false,
                    tension:     0,
                    borderWidth: 2.2,
                    borderColor: cfg.lineColor,
                    spanGaps:    false,

                    pointRadius: (ctx) => {
                        const i = ctx.dataIndex;
                        if (avgPoints[i]?.y == null) return 0;
                        if (i === maxIdx || i === minIdx) return isMobile ? 5 : 6;
                        return isMobile ? 3 : 3.5;
                    },
                    pointHoverRadius:     (ctx) => avgPoints[ctx.dataIndex]?.y != null ? 7 : 0,
                    pointBackgroundColor: (ctx) => {
                        const i = ctx.dataIndex;
                        if (i === maxIdx) return cfg.highColor;
                        if (i === minIdx) return cfg.lowColor;
                        return cfg.lineColor;
                    },
                    pointBorderColor: (ctx) => {
                        const i = ctx.dataIndex;
                        return (i === maxIdx || i === minIdx) ? 'rgba(255,255,255,0.55)' : cfg.lineColor;
                    },
                    pointBorderWidth: (ctx) =>
                        (ctx.dataIndex === maxIdx || ctx.dataIndex === minIdx) ? 1.5 : 1,
                    order: 1,
                },
                // Dashed gap line — connects known points across missing days.
                // spanGaps: true draws through nulls; the solid avg line hides
                // it where consecutive data exists (order 1 draws on top).
                {
                    label:            '__gap__',
                    data:             avgPoints,
                    spanGaps:         true,
                    fill:             false,
                    tension:          0,
                    borderWidth:      1.5,
                    borderDash:       [4, 4],
                    borderColor:      'rgba(148, 163, 184, 0.28)',
                    pointRadius:      0,
                    pointHoverRadius: 0,
                    order:            2,
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

        plugins: [makeHLPlugin(minIdx, maxIdx, cfg, isMobile)],
    });
}
