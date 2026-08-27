import {
    COLOR_SCALES,
    METRIC_CONFIG,
    scaleToRgbString,
    createDynamicGradient,
    buildAreaFill,
} from './chart-metrics.js';
import {
    insertGapNulls,
    extractGapSegments,
    getDynamicYBounds,
    getMinMaxPoints,
    hasEnoughDataDuration,
} from './chart-series.js';
// Imported for its side effect too: registers the 'minMaxLabels' plugin.
import { measureLabel, resolveCollisionScenario } from './chart-labels.js';
import { installPointerHandlers, externalTooltipHandler } from './chart-interaction.js';

const chartInstances = new Map();


/* =========================================================
   CHART STATE
   Recomputed on every render and stashed on the chart instance
   (chart.$state) so dataset callbacks + plugins always read the
   latest analytics — letting us update in place instead of
   destroying/recreating the chart each poll cycle.
========================================================= */
function computeChartState(backendData, metric, resolutionMinutes, options = {}) {
    const config   = METRIC_CONFIG[metric] ?? METRIC_CONFIG.temperature;
    const scale    = COLOR_SCALES[metric] ?? COLOR_SCALES.temperature;
    const isMobile = window.innerWidth <= 480;
    const xUnit    = options.xUnit ?? 'hour';
    // showNow only applies to hourly (live) charts
    const showNow  = options.showNow !== false && xUnit === 'hour';
    const apiMode  = options.apiMode === true;

    // ── Time range ──────────────────────────────────────────
    const today       = new Date();
    let startRange, endRange;

    if (options.xRange) {
        startRange = options.xRange.from;
        endRange   = options.xRange.to;
    } else {
        const displayDate = options.refDate ?? today;
        startRange = new Date(displayDate); startRange.setHours(0, 0, 0, 0);
        endRange   = new Date(displayDate);
        if (showNow) {
            endRange.setHours(23, 59, 59, 999);
        } else {
            endRange.setDate(endRange.getDate() + 1);
            endRange.setHours(0, 0, 0, 0);
        }
    }

    // ── Build point arrays ──────────────────────────────────
    const rawPoints = (backendData || []).map(item => ({
        x: new Date(item.hour),
        y: item.hourlyValue,
    }));

    // For historical single-day views, trim the right x-axis edge to just past
    // the last data point so there is no visible empty strip after the final bucket.
    if (!showNow && !options.xRange && rawPoints.length > 0) {
        const lastTime = rawPoints[rawPoints.length - 1].x.getTime();
        endRange.setTime(lastTime + 5 * 60 * 1000);
    }

    // API charts deliver a fixed 24-hour set ending at 23:00 — trim the axis to
    // match so the line reaches the right edge instead of leaving an empty hour.
    if (apiMode && rawPoints.length > 0) {
        const lastTime = rawPoints[rawPoints.length - 1].x.getTime();
        endRange.setTime(lastTime + 5 * 60 * 1000);
    }

    // ── X-axis tick step for daily charts ──────────────────
    const daySpan   = xUnit === 'day'
        ? Math.round((endRange.getTime() - startRange.getTime()) / 86400000)
        : 0;
    const xTickStep = daySpan <= 8 ? 1 : daySpan <= 16 ? 2 : 5;

    const chartPoints = insertGapNulls(rawPoints, resolutionMinutes);
    const gapBoundary = showNow ? today : endRange;
    const gapPoints   = extractGapSegments(rawPoints, resolutionMinutes, startRange, gapBoundary);

    // ── Analytics ───────────────────────────────────────────
    const yBounds                = getDynamicYBounds(chartPoints, metric);
    const { minIndex, maxIndex } = getMinMaxPoints(chartPoints);
    // H/L markers only make sense on hourly charts (not daily trend lines)
    const showMinMax             = xUnit === 'hour' && hasEnoughDataDuration(backendData);
    const validMinMax            = showMinMax
        && minIndex !== -1 && maxIndex !== -1
        && minIndex !== maxIndex;

    // Last non-null point index for "Now" marker + future overlay
    let latestIndex = chartPoints.length - 1;
    while (latestIndex > 0 && chartPoints[latestIndex]?.y == null) latestIndex--;

    // For API charts the backend returns all 24 hours including future predictions.
    // Snap the "Now" marker to the most recent past data point instead of the last one.
    if (apiMode) {
        const nowMs = Date.now();
        let apiNowIdx = -1;
        for (let i = 0; i < chartPoints.length; i++) {
            if (chartPoints[i]?.y != null && chartPoints[i].x.getTime() <= nowMs) apiNowIdx = i;
        }
        if (apiNowIdx !== -1) latestIndex = apiNowIdx;
    }

    const scenario = resolveCollisionScenario(
        metric, chartPoints, minIndex, maxIndex, latestIndex,
        validMinMax, resolutionMinutes, config
    );

    return {
        metric, resolutionMinutes, config, scale, isMobile, showNow, apiMode,
        today, startRange, endRange,
        xUnit, xTickStep,
        chartPoints, gapPoints, yBounds,
        minIndex, maxIndex, latestIndex,
        showMinMax, validMinMax, scenario,
    };
}

/* =========================================================
   DATASETS — every scriptable option reads chart.$state so a
   plain chart.update() reflects new data without a rebuild
========================================================= */
function buildDatasets(state) {
    const mainDataset = {
        label:           state.config.label,
        data:            state.chartPoints,
        spanGaps:        false,
        fill:            true,
        tension:         0.5,
        borderWidth:     2.8,
        borderCapStyle:  'round',
        borderJoinStyle: 'round',

        backgroundColor: (context) => {
            const chart = context.chart;
            const { chartArea } = chart;
            if (!chartArea) return 'rgba(0,0,0,0)';
            return buildAreaFill(chart.ctx, chartArea, chart.$state);
        },

        borderColor: (context) => {
            const chart = context.chart;
            const { chartArea, scales } = chart;
            const st = chart.$state;
            if (!chartArea) return st.config.lineColor ?? '#7dd3fc';
            return createDynamicGradient(chart.ctx, chartArea, scales.y, st.scale);
        },

        // API charts show a full-day forecast: the future is the relevant part,
        // so the already-elapsed (past) portion of the line is greyed out. Each
        // segment up to the "Now" marker returns a flat grey; everything after
        // returns undefined to fall back to the value-based gradient above.
        segment: {
            borderColor: (ctx) => {
                const st = ctx.chart.$state;
                if (!st?.apiMode) return undefined;
                return ctx.p1DataIndex <= st.latestIndex
                    ? 'rgba(148, 163, 184, 0.45)'
                    : undefined;
            },
        },

        pointRadius: (context) => {
            const st = context.chart.$state;
            const i  = context.dataIndex;
            const pt = st.chartPoints[i];
            if (!pt || pt.y == null) return 0;
            if (i === st.latestIndex || i === st.maxIndex || i === st.minIndex) {
                return st.isMobile ? 3 : 3.5;
            }
            return 0;
        },
        pointHoverRadius: (context) => {
            const st = context.chart.$state;
            const pt = st.chartPoints[context.dataIndex];
            return pt?.y != null ? 6 : 0;
        },

        pointBackgroundColor: (context) => {
            const st = context.chart.$state;
            const i  = context.dataIndex;
            if (i === st.latestIndex) return '#ffffff';
            if (i === st.maxIndex)    return st.config.maxNodeColor;
            if (i === st.minIndex)    return st.config.minNodeColor;
            return st.config.lineColor ?? '#7dd3fc';
        },

        pointBorderColor: (context) => {
            const st = context.chart.$state;
            const i  = context.dataIndex;
            if (i === st.latestIndex) {
                // Latest reading is also today's high/low — ring the
                // "Now" pin in the H/L color to mark the overlap
                if (st.showMinMax && i === st.maxIndex) return st.config.maxNodeColor;
                if (st.showMinMax && i === st.minIndex) return st.config.minNodeColor;
                return scaleToRgbString(st.scale, st.chartPoints[st.latestIndex].y);
            }
            if (i === st.maxIndex) return st.config.innerBorder;
            if (i === st.minIndex) return st.config.innerBorder;
            return st.config.lineColor ?? '#7dd3fc';
        },

        pointBorderWidth: 2,
    };

    const gapDataset = {
        label:                    '__gap__',
        data:                     state.gapPoints,
        spanGaps:                 false,
        fill:                     false,
        tension:                  0,
        borderWidth:              1.5,
        borderDash:               [5, 5],
        borderColor:              'rgba(148, 163, 184, 0.35)',
        borderCapStyle:           'round',
        pointRadius:              0,
        pointHoverRadius:         8,
        pointHoverBackgroundColor:'rgba(148, 163, 184, 0.15)',
        pointHoverBorderColor:    'rgba(148, 163, 184, 0.5)',
        pointHoverBorderWidth:    1,
    };

    return [mainDataset, gapDataset];
}

/* =========================================================
   CREATE — fresh instance (first render, or metric/resolution
   change). Static options close over `state`; scriptable
   options + plugins read the live chart.$state.
========================================================= */
function createChart(canvasElement, state) {
    const ctx = canvasElement.getContext('2d');
    installPointerHandlers(canvasElement);

    const chart = new Chart(ctx, {
        type: 'line',
        data: { datasets: buildDatasets(state) },

        options: {
            responsive:          true,
            maintainAspectRatio: false,
            interaction: { intersect: false, mode: 'index' },

            animations: {
                tension: {
                    duration: 1200,
                    easing:   'easeOutQuart',
                    from:     0.3,
                    to:       0.5,
                }
            },

            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit:           state.xUnit,
                        displayFormats: state.xUnit === 'day'
                            ? { day: 'MMM d' }
                            : { hour: 'H' },
                        tooltipFormat:  state.xUnit === 'day' ? 'MMM d' : 'HH:mm',
                    },
                    min:    state.startRange,
                    max:    state.endRange,
                    ticks:  { stepSize: state.xUnit === 'day' ? state.xTickStep : 3, color: 'rgba(255,255,255,0.80)', font: { size: state.isMobile ? 9 : 11 } },
                    grid:   { color: 'rgba(255,255,255,0.09)', drawBorder: false },
                    border: { display: false },
                },
                y: {
                    suggestedMin: state.yBounds.suggestedMin,
                    suggestedMax: state.yBounds.suggestedMax,
                    ticks: {
                        stepSize: state.config.yStep,
                        callback: (val) => `${val}${state.config.yAxisSuffix}`,
                        color:    'rgba(255,255,255,0.80)',
                        font:     { size: state.isMobile ? 9 : 11 },
                    },
                    grid:   { color: 'rgba(255,255,255,0.028)', drawBorder: false },
                    border: { display: false },
                }
            },

            plugins: {
                legend: { display: false },

                tooltip: {
                    enabled:  false,
                    external: externalTooltipHandler,

                    filter: (item) => {
                        // hide null sentinel points from both datasets
                        return item.raw?.y != null;
                    },

                    callbacks: {
                        title: (items) => {
                            if (!items.length) return '';
                            const isGap = items.some(i => i.dataset.label === '__gap__');
                            if (isGap) return 'Missing data';
                            const st = items[0].chart.$state;
                            if (st.xUnit === 'day') {
                                return new Date(items[0].parsed.x).toLocaleDateString([], {
                                    weekday: 'short', month: 'short', day: 'numeric',
                                });
                            }
                            return new Date(items[0].parsed.x).toLocaleTimeString([], {
                                hour: '2-digit', minute: '2-digit',
                            });
                        },

                        label: (context) => {
                            const st = context.chart.$state;
                            if (context.dataset.label === '__gap__') {
                                // find the two endpoints of this gap segment
                                const data  = context.dataset.data;
                                const idx   = context.dataIndex;

                                // walk to find segment start (y != null going backwards)
                                let start = idx;
                                while (start > 0 && data[start - 1]?.y != null) start--;

                                // walk to find segment end
                                let end = idx;
                                while (end < data.length - 1 && data[end + 1]?.y != null) end++;

                                if (data[start] && data[end] && start !== end) {
                                    const from     = new Date(data[start].x)
                                        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                    const to       = new Date(data[end].x)
                                        .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                    const diffMins = Math.round(
                                        (data[end].x - data[start].x) / 60000
                                    );
                                    return ` ${from} → ${to}  (${diffMins} min)`;
                                }
                                return ' No data recorded';
                            }

                            let suffix = '';
                            if (st.validMinMax) {
                                const idx = context.dataIndex;
                                if (st.scenario === 'triple'
                                    && (idx === st.maxIndex || idx === st.minIndex || idx === st.latestIndex)) {
                                    suffix = ' (Max/Min Peak)';
                                } else if (idx === st.maxIndex) {
                                    suffix = ' (Today Highest)';
                                } else if (idx === st.minIndex) {
                                    suffix = ' (Today Lowest)';
                                }
                            }

                            return ` ${context.parsed.y.toFixed(1)}${st.config.tooltipSuffix}${suffix}`;
                        },

                        labelTextColor: (context) =>
                            context.dataset.label === '__gap__'
                                ? 'rgba(148, 163, 184, 0.8)'
                                : '#e2e8f0',
                    }
                },

                minMaxLabels: {
                    minIndex:      state.minIndex,
                    maxIndex:      state.maxIndex,
                    latestIndex:   state.latestIndex,
                    validMinMax:   state.validMinMax,
                    scenario:      state.scenario,
                    isMobile:      state.isMobile,
                    showNow:       state.showNow,
                    maxLabelColor: state.config.maxNodeColor,
                    minLabelColor: state.config.minNodeColor,
                }
            }
        },

        plugins: [
            // ── State bootstrap ─────────────────────────────
            // Chart.js resolves scriptable options during the constructor's
            // first update — before any post-construction assignment runs —
            // so seed chart.$state here, ahead of the first draw.
            {
                id: 'stateBootstrap',
                beforeInit(chart) { chart.$state = state; },
            },

            // ── Future area overlay ─────────────────────────
            {
                id: 'futureAreaOverlay',
                beforeDatasetsDraw(chart) {
                    const st = chart.$state;
                    if (!st.showNow || !st.chartPoints.length) return;
                    const { ctx, chartArea, scales } = chart;
                    const lastReal = st.chartPoints[st.latestIndex];
                    if (!lastReal) return;

                    const nowX = scales.x.getPixelForValue(
                        new Date(Math.max(st.today.getTime(), lastReal.x.getTime()))
                    );

                    ctx.save();
                    ctx.fillStyle = 'rgba(255,255,255,0.045)';
                    if (st.apiMode) {
                        // Forecast chart: the elapsed (past) side is shaded —
                        // mirror of the sensor chart's future overlay.
                        const overlayEnd = nowX - 3;
                        ctx.fillRect(
                            chartArea.left, chartArea.top,
                            overlayEnd - chartArea.left,
                            chartArea.bottom - chartArea.top
                        );
                    } else {
                        // Sensor chart: shade the not-yet-recorded future. Any gap
                        // between the last reading and now is rendered as a
                        // missing-data bridge instead (see extractGapSegments).
                        const overlayStart = nowX + 3;
                        ctx.fillRect(
                            overlayStart, chartArea.top,
                            chartArea.right - overlayStart,
                            chartArea.bottom - chartArea.top
                        );
                    }

                    ctx.beginPath();
                    ctx.moveTo(nowX, chartArea.top);
                    ctx.lineTo(nowX, chartArea.bottom);
                    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
                    ctx.lineWidth   = 1;
                    ctx.setLineDash([4, 4]);
                    ctx.stroke();
                    ctx.restore();
                }
            },

            // ── Line glow ───────────────────────────────────
            {
                id: 'lineGlow',
                beforeDatasetDraw(chart, args) {
                    // only glow the main dataset, not the gap line
                    if (args.index !== 0) return;
                    const { ctx } = chart;
                    ctx.save();
                    ctx.shadowColor   = chart.$state.config.shadowColor;
                    ctx.shadowBlur    = 12;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                },
                afterDatasetDraw(chart, args) {
                    if (args.index !== 0) return;
                    chart.ctx.restore();
                }
            },

            // ── "No data" text labels on wide gaps ──────────
            {
                id: 'gapLabels',
                afterDatasetsDraw(chart) {
                    const gapMeta = chart.getDatasetMeta(1);
                    if (!gapMeta?.data?.length) return;

                    const { ctx, chartArea } = chart;
                    const data = chart.data.datasets[1].data;
                    const font = chart.$state.isMobile ? '500 9px Figtree' : '500 10px Figtree';

                    ctx.save();
                    ctx.fillStyle    = 'rgba(148, 163, 184, 0.4)';
                    ctx.textAlign    = 'center';
                    ctx.textBaseline = 'middle';
                    const { halfW, halfH } = measureLabel(ctx, 'No data', font);

                    for (let i = 0; i < data.length - 1; i++) {
                        const a = data[i];
                        const b = data[i + 1];
                        if (!a || !b || a.y == null || b.y == null) continue;

                        const aPoint = gapMeta.data[i];
                        const bPoint = gapMeta.data[i + 1];
                        if (!aPoint || !bPoint) continue;

                        const gapPx = bPoint.x - aPoint.x;
                        if (gapPx <= 50) continue;

                        // follow the bridge's own height instead of the
                        // chart's vertical center, clamped clear of the edges
                        const midX = Math.min(Math.max((aPoint.x + bPoint.x) / 2, chartArea.left + halfW), chartArea.right - halfW);
                        const midY = Math.min(Math.max((aPoint.y + bPoint.y) / 2, chartArea.top + halfH), chartArea.bottom - halfH);

                        ctx.fillText('No data', midX, midY);
                    }

                    ctx.restore();
                }
            }
        ]
    });

    chart.$state      = state;
    chart.$metric     = state.metric;
    chart.$resolution = state.resolutionMinutes;
    chart.$xUnit      = state.xUnit;
    return chart;
}

/* =========================================================
   UPDATE — reuses the live instance: swap data + analytics and
   repaint with no animation (no destroy/recreate, no replayed
   tension animation on every poll)
========================================================= */
function updateChart(chart, state) {
    chart.$state = state;

    chart.data.datasets[0].data = state.chartPoints;
    chart.data.datasets[1].data = state.gapPoints;

    const y = chart.options.scales.y;
    y.suggestedMin = state.yBounds.suggestedMin;
    y.suggestedMax = state.yBounds.suggestedMax;

    const x = chart.options.scales.x;
    x.min = state.startRange;
    x.max = state.endRange;

    const p = chart.options.plugins.minMaxLabels;
    p.minIndex      = state.minIndex;
    p.maxIndex      = state.maxIndex;
    p.latestIndex   = state.latestIndex;
    p.validMinMax   = state.validMinMax;
    p.scenario      = state.scenario;
    p.isMobile      = state.isMobile;
    p.showNow       = state.showNow;
    p.maxLabelColor = state.config.maxNodeColor;
    p.minLabelColor = state.config.minNodeColor;

    chart.update('none');
}

/* =========================================================
   MAIN CHART RENDER ENGINE
   Reuses the existing instance when only the data changed; a
   full rebuild is paid only on metric/resolution change (or the
   first render).
========================================================= */
export function renderWeatherChart(backendData, metric = 'temperature', resolutionMinutes = 10, options = {}) {
    try {
        const canvasId = options.canvasId ?? 'weatherChart';
        const canvasElement = document.getElementById(canvasId);
        if (!canvasElement) {
            console.error(`Canvas '${canvasId}' not found.`);
            return;
        }

        const state = computeChartState(backendData, metric, resolutionMinutes, options);

        const tracked = chartInstances.get(canvasId) ?? null;
        const live    = Chart.getChart(canvasElement) ?? null;
        // If another module destroyed or replaced our chart, the tracked reference
        // is stale — treat it as absent so we fall through to a fresh create.
        const existing = (tracked !== null && tracked === live) ? tracked : null;
        if (tracked !== null && tracked !== live) chartInstances.delete(canvasId);

        const canReuse = existing
            && existing.$metric === metric
            && existing.$resolution === resolutionMinutes
            && existing.$xUnit === (options.xUnit ?? 'hour');

        if (canReuse) {
            updateChart(existing, state);
        } else {
            // Destroy any chart on this canvas — covers both own instances and
            // charts created by other modules (e.g. daily-chart.js).
            Chart.getChart(canvasElement)?.destroy();
            chartInstances.delete(canvasId);
            chartInstances.set(canvasId, createChart(canvasElement, state));
        }
    } catch (error) {
        console.error('Error rendering weather chart:', error);
    }
}