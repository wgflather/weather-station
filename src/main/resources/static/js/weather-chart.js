let weatherChartInstance = null;

/* =========================================================
   TEMPERATURE COLOR SCALE
========================================================= */
const TEMP_COLOR_SCALE = [
    { temp: -20, r:  59, g: 130, b: 246 },
    { temp:  -5, r: 147, g: 197, b: 253 },
    { temp:   5, r: 224, g: 242, b: 254 },
    { temp:  15, r: 253, g: 230, b: 138 },
    { temp:  25, r: 251, g: 146, b:  60 },
    { temp:  35, r: 239, g:  68, b:  68 },
];

function tempToRgb(temp) {
    const scale = TEMP_COLOR_SCALE;
    if (temp <= scale[0].temp) return { ...scale[0] };
    if (temp >= scale[scale.length - 1].temp) return { ...scale[scale.length - 1] };
    for (let i = 0; i < scale.length - 1; i++) {
        const lo = scale[i];
        const hi = scale[i + 1];
        if (temp >= lo.temp && temp <= hi.temp) {
            const t = (temp - lo.temp) / (hi.temp - lo.temp);
            return {
                r: Math.round(lo.r + t * (hi.r - lo.r)),
                g: Math.round(lo.g + t * (hi.g - lo.g)),
                b: Math.round(lo.b + t * (hi.b - lo.b)),
            };
        }
    }
    return { r: 255, g: 255, b: 255 };
}

function tempToRgbString(temp, alpha = 1) {
    const { r, g, b } = tempToRgb(temp);
    return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

/* =========================================================
   METRIC CONFIG
========================================================= */
const METRIC_CONFIG = {
    temperature: {
        label:         'Temperature',
        tooltipSuffix: '°C',
        yAxisSuffix:   '°',
        yStep:         1,
        lineColor:     null,
        shadowColor:   'rgba(255, 120, 90, 0.25)',
        fillTop:       null,
        fillMid:       null,
        maxNodeColor:  '#ef4444',
        minNodeColor:  '#3b82f6',
        innerBorder:   '#ffffff',
    },
    pressure: {
        label:         'Pressure',
        tooltipSuffix: ' hPa',
        yAxisSuffix:   '',
        yStep:         4,
        lineColor:     '#cbd5e1',
        shadowColor:   'rgba(203, 213, 225, 0.20)',
        fillTop:       'rgba(203, 213, 225, 0.22)',
        fillMid:       'rgba(203, 213, 225, 0.05)',
        maxNodeColor:  '#e2e8f0',
        minNodeColor:  '#94a3b8',
        innerBorder:   '#f8fafc',
    },
    humidity: {
        label:         'Humidity',
        tooltipSuffix: '%',
        yAxisSuffix:   '%',
        yStep:         5,
        lineColor:     '#38bdf8',
        shadowColor:   'rgba(56, 189, 248, 0.25)',
        fillTop:       'rgba(56, 189, 248, 0.22)',
        fillMid:       'rgba(56, 189, 248, 0.05)',
        maxNodeColor:  '#7dd3fc',
        minNodeColor:  '#0ea5e9',
        innerBorder:   '#e0f2fe',
    },
};

/* =========================================================
   GAP DETECTION — inserts null sentinels into main dataset
========================================================= */
function insertGapNulls(rawPoints, resolutionMinutes) {
    if (rawPoints.length < 2) return rawPoints;

    const result       = [];
    const gapThreshold = resolutionMinutes * 60 * 1000 * 2.5;

    for (let i = 0; i < rawPoints.length; i++) {
        result.push(rawPoints[i]);

        if (i < rawPoints.length - 1) {
            const curr = rawPoints[i].x.getTime();
            const next = rawPoints[i + 1].x.getTime();

            if (next - curr > gapThreshold) {
                result.push({ x: new Date(curr + 1000), y: null });
                result.push({ x: new Date(next - 1000), y: null });
            }
        }
    }

    return result;
}

/* =========================================================
   GAP SEGMENT EXTRACTION — builds second dataset for dashed bridge
========================================================= */
function extractGapSegments(rawPoints, resolutionMinutes) {
    if (rawPoints.length < 2) return [];

    const gapThreshold = resolutionMinutes * 60 * 1000 * 2.5;
    const segments     = [];

    for (let i = 0; i < rawPoints.length - 1; i++) {
        const curr = rawPoints[i];
        const next = rawPoints[i + 1];
        const diff = next.x.getTime() - curr.x.getTime();

        if (diff > gapThreshold) {
            segments.push({ x: curr.x, y: curr.y });
            segments.push({ x: next.x, y: next.y });
            // null separator so multiple gaps don't connect
            segments.push({ x: new Date(next.x.getTime() + 1), y: null });
        }
    }

    return segments;
}

/* =========================================================
   DYNAMIC Y AXIS BOUNDS
========================================================= */
function getDynamicYBounds(points, metric) {
    const real = (points || []).filter(p => p.y != null);

    if (!real.length) {
        if (metric === 'humidity') return { suggestedMin: 20,  suggestedMax: 100  };
        if (metric === 'pressure') return { suggestedMin: 990, suggestedMax: 1030 };
        return { suggestedMin: 10, suggestedMax: 30 };
    }

    const values = real.map(p => p.y);
    const pad    = metric === 'humidity' ? 3 : 2;
    return {
        suggestedMin: Math.min(...values) - pad,
        suggestedMax: Math.max(...values) + pad,
    };
}

/* =========================================================
   MIN / MAX INDEX (operates on real points only)
========================================================= */
function getMinMaxPoints(points) {
    const real = (points || []).filter(p => p.y != null);
    if (!real.length) return { minIndex: -1, maxIndex: -1, isTooClose: false };

    let minReal = 0;
    let maxReal = 0;

    real.forEach((pt, i) => {
        if (pt.y < real[minReal].y) minReal = i;
        if (pt.y > real[maxReal].y) maxReal = i;
    });

    const indexDistance = Math.abs(maxReal - minReal);
    const valueDelta    = Math.abs(real[maxReal].y - real[minReal].y);
    const isTooClose    = indexDistance <= 2 || valueDelta < 0.2;

    // map back to full array indices
    const minTime = real[minReal].x.getTime();
    const maxTime = real[maxReal].x.getTime();
    const fullMin = points.findIndex(p => p.x.getTime() === minTime && p.y != null);
    const fullMax = points.findIndex(p => p.x.getTime() === maxTime && p.y != null);

    return { minIndex: fullMin, maxIndex: fullMax, isTooClose };
}

function hasEnoughDataDuration(backendData) {
    if (!backendData || backendData.length < 2) return false;
    const first = new Date(backendData[0].hour).getTime();
    const last  = new Date(backendData[backendData.length - 1].hour).getTime();
    return ((last - first) / 60000) >= 90;
}

/* =========================================================
   TEMPERATURE GRADIENT
========================================================= */
function createDynamicGradient(ctx, chartArea, yAxis) {
    const grad = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    const maxT = yAxis.max;
    const minT = yAxis.min;
    for (let i = 0; i <= 10; i++) {
        const pos         = i / 10;
        const currentTemp = maxT - (pos * (maxT - minT));
        grad.addColorStop(pos, tempToRgbString(currentTemp));
    }
    return grad;
}

/* =========================================================
   MIN / MAX / NOW LABELS PLUGIN
========================================================= */
const minMaxLabelsPlugin = {
    id: 'minMaxLabels',
    afterDatasetsDraw(chart, args, pluginOptions) {
        const { ctx } = chart;
        const meta    = chart.getDatasetMeta(0);
        if (!meta.data || !meta.data.length) return;

        const {
            minIndex, maxIndex, isTooClose,
            latestIndex, showMinMax,
            maxLabelColor, minLabelColor,
            isMobile,
        } = pluginOptions;

        const latestPoint = meta.data[latestIndex];

        // On mobile: only render "Now", skip H/L
        if (isMobile) {
            if (latestPoint) {
                ctx.save();
                ctx.font         = '700 10px Nunito';
                ctx.fillStyle    = '#ffffff';
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('Now', latestPoint.x, latestPoint.y - 20);
                ctx.restore();
            }
            return;
        }

        const renderMinMax = showMinMax
            && minIndex !== -1 && maxIndex !== -1
            && minIndex !== maxIndex;

        const maxPoint = meta.data[maxIndex];
        const minPoint = meta.data[minIndex];

        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        if (renderMinMax && maxPoint) {
            ctx.font      = '700 11px Nunito';
            ctx.fillStyle = maxLabelColor;
            ctx.fillText('H', maxPoint.x, maxPoint.y + (latestIndex === maxIndex ? -22 : -20));
        }

        if (renderMinMax && minPoint) {
            ctx.font      = '700 11px Nunito';
            ctx.fillStyle = minLabelColor;
            const yOffset = isTooClose ? 24 : 20;
            ctx.fillText('L', minPoint.x, minPoint.y + (latestIndex === minIndex ? 26 : yOffset));
        }

        if (latestPoint) {
            ctx.font      = '700 10px Nunito';
            ctx.fillStyle = '#ffffff';
            let nowOffset = -28;
            if (renderMinMax && latestIndex === maxIndex) nowOffset = -42;
            if (renderMinMax && latestIndex === minIndex) nowOffset = isTooClose ? 38 : -28;
            ctx.fillText('Now', latestPoint.x, latestPoint.y + nowOffset);
        }

        ctx.restore();
    }
};

Chart.register(minMaxLabelsPlugin);

/* =========================================================
   MAIN CHART RENDER ENGINE
========================================================= */
export function renderWeatherChart(backendData, metric = 'temperature', resolutionMinutes = 10) {
    try {
        const config   = METRIC_CONFIG[metric] ?? METRIC_CONFIG.temperature;
        const isTemp   = metric === 'temperature';
        const isMobile = window.innerWidth <= 480;

        // ── Build point arrays ──────────────────────────────────
        const rawPoints = (backendData || []).map(item => ({
            x: new Date(item.hour),
            y: item.hourlyValue,
        }));

        const chartPoints = insertGapNulls(rawPoints, resolutionMinutes);
        const gapPoints   = extractGapSegments(rawPoints, resolutionMinutes);

        // ── Time range ──────────────────────────────────────────
        const today      = new Date();
        const startRange = new Date(today); startRange.setHours(0, 0, 0, 0);
        const endRange   = new Date(today); endRange.setHours(23, 59, 59, 999);

        // ── Analytics ───────────────────────────────────────────
        const yBounds                            = getDynamicYBounds(chartPoints, metric);
        const { minIndex, maxIndex, isTooClose } = getMinMaxPoints(chartPoints);
        const showMinMax                         = hasEnoughDataDuration(backendData);

        // Last non-null point index for "Now" marker + future overlay
        let latestIndex = chartPoints.length - 1;
        while (latestIndex > 0 && chartPoints[latestIndex]?.y == null) latestIndex--;

        // ── Destroy previous instance ───────────────────────────
        if (weatherChartInstance !== null) {
            weatherChartInstance.destroy();
            weatherChartInstance = null;
        }

        const canvasElement = document.getElementById('weatherChart');
        if (!canvasElement) {
            console.error("Canvas 'weatherChart' not found.");
            return;
        }

        const ctx = canvasElement.getContext('2d');

        // ── Area fill gradient ──────────────────────────────────
        const gradientFill = ctx.createLinearGradient(0, 0, 0, 350);

        if (isTemp) {
            const realPoints = chartPoints.filter(p => p.y != null);
            const avgTemp    = realPoints.length
                ? realPoints.reduce((s, p) => s + p.y, 0) / realPoints.length
                : 15;
            gradientFill.addColorStop(0,   tempToRgbString(avgTemp, 0.28));
            gradientFill.addColorStop(0.5, tempToRgbString(avgTemp, 0.07));
            gradientFill.addColorStop(1,   'rgba(255,255,255,0)');
        } else {
            gradientFill.addColorStop(0,    config.fillTop);
            gradientFill.addColorStop(0.45, config.fillMid);
            gradientFill.addColorStop(1,    'rgba(255,255,255,0)');
        }

        // ── Main dataset ────────────────────────────────────────
        const mainDataset = {
            label:           config.label,
            data:            chartPoints,
            spanGaps:        false,
            backgroundColor: gradientFill,
            fill:            true,
            tension:         0.5,
            borderWidth:     2.8,
            borderCapStyle:  'round',
            borderJoinStyle: 'round',

            borderColor: (context) => {
                if (!isTemp) return config.lineColor;
                const chart = context.chart;
                const { ctx, chartArea, scales } = chart;
                if (!chartArea) return '#7dd3fc';
                return createDynamicGradient(ctx, chartArea, scales.y);
            },

            pointRadius: (context) => {
                const i  = context.dataIndex;
                const pt = chartPoints[i];
                if (!pt || pt.y == null) return 0;
                if (i === latestIndex) return 6;
                if (i === maxIndex)    return 4.5;
                if (i === minIndex)    return 4.5;
                return 0;
            },
            pointHoverRadius: (context) => {
                const pt = chartPoints[context.dataIndex];
                return pt?.y != null ? 6 : 0;
            },

            pointBackgroundColor: (context) => {
                const i = context.dataIndex;
                if (i === latestIndex) return '#ffffff';
                if (i === maxIndex)    return config.maxNodeColor;
                if (i === minIndex)    return config.minNodeColor;
                return config.lineColor ?? '#7dd3fc';
            },

            pointBorderColor: (context) => {
                const i = context.dataIndex;
                if (i === latestIndex) return isTemp
                    ? tempToRgbString(chartPoints[latestIndex].y)
                    : config.lineColor;
                if (i === maxIndex) return config.innerBorder;
                if (i === minIndex) return config.innerBorder;
                return config.lineColor ?? '#7dd3fc';
            },

            pointBorderWidth: (context) =>
                context.dataIndex === latestIndex ? 3 : 2,
        };

        // ── Gap bridge dataset ──────────────────────────────────
        const gapDataset = {
            label:                    '__gap__',
            data:                     gapPoints,
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

        // ── Chart ───────────────────────────────────────────────
        weatherChartInstance = new Chart(ctx, {
            type: 'line',
            data: { datasets: [mainDataset, gapDataset] },

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
                            unit:           'hour',
                            displayFormats: { hour: 'H' },
                            tooltipFormat:  'HH:mm',
                        },
                        min:    startRange,
                        max:    endRange,
                        ticks:  { stepSize: 3, color: '#94a3b8', font: { size: 11 } },
                        grid:   { color: 'rgba(255,255,255,0.045)', drawBorder: false },
                        border: { display: false },
                    },
                    y: {
                        suggestedMin: yBounds.suggestedMin,
                        suggestedMax: yBounds.suggestedMax,
                        ticks: {
                            stepSize: config.yStep,
                            callback: (val) => `${val}${config.yAxisSuffix}`,
                            color:    '#94a3b8',
                            font:     { size: 11 },
                        },
                        grid:   { color: 'rgba(255,255,255,0.045)', drawBorder: false },
                        border: { display: false },
                    }
                },

                plugins: {
                    legend: { display: false },

                    tooltip: {
                        backgroundColor: 'rgba(12, 20, 42, 0.94)',
                        borderColor:     'rgba(255,255,255,0.10)',
                        borderWidth:     1,
                        padding:         12,
                        displayColors:   false,
                        titleColor:      '#ffffff',
                        bodyColor:       '#e2e8f0',
                        titleFont: { size: 12, weight: '600' },
                        bodyFont:  { size: 14, weight: '700' },

                        filter: (item) => {
                            // hide null sentinel points from both datasets
                            return item.raw?.y != null;
                        },

                        callbacks: {
                            title: (items) => {
                                if (!items.length) return '';
                                const isGap = items.some(i => i.dataset.label === '__gap__');
                                if (isGap) return 'Missing data';
                                return new Date(items[0].parsed.x).toLocaleTimeString([], {
                                    hour: '2-digit', minute: '2-digit',
                                });
                            },

                            label: (context) => {
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

                                return ` ${context.parsed.y.toFixed(1)}${config.tooltipSuffix}`;
                            },

                            labelTextColor: (context) =>
                                context.dataset.label === '__gap__'
                                    ? 'rgba(148, 163, 184, 0.8)'
                                    : '#e2e8f0',
                        }
                    },

                    minMaxLabels: {
                        minIndex,
                        maxIndex,
                        isTooClose,
                        latestIndex,
                        showMinMax,
                        isMobile,
                        maxLabelColor: config.maxNodeColor,
                        minLabelColor: config.minNodeColor,
                    }
                }
            },

            plugins: [
                // ── Future area overlay ─────────────────────────
                {
                    id: 'futureAreaOverlay',
                    beforeDatasetsDraw(chart) {
                        if (!chartPoints.length) return;
                        const { ctx, chartArea, scales } = chart;
                        const lastReal = chartPoints[latestIndex];
                        if (!lastReal) return;

                        const latestX      = scales.x.getPixelForValue(lastReal.x);
                        const overlayStart = latestX + 3;

                        ctx.save();
                        ctx.fillStyle = 'rgba(255,255,255,0.045)';
                        ctx.fillRect(
                            overlayStart, chartArea.top,
                            chartArea.right - overlayStart,
                            chartArea.bottom - chartArea.top
                        );
                        ctx.beginPath();
                        ctx.moveTo(latestX, chartArea.top);
                        ctx.lineTo(latestX, chartArea.bottom);
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
                        ctx.shadowColor   = config.shadowColor;
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

                        ctx.save();
                        ctx.font      = '500 10px Nunito';
                        ctx.fillStyle = 'rgba(148, 163, 184, 0.4)';
                        ctx.textAlign = 'center';

                        for (let i = 0; i < data.length - 1; i++) {
                            const a = data[i];
                            const b = data[i + 1];
                            if (!a || !b || a.y == null || b.y == null) continue;

                            const aPoint = gapMeta.data[i];
                            const bPoint = gapMeta.data[i + 1];
                            if (!aPoint || !bPoint) continue;

                            const midX  = (aPoint.x + bPoint.x) / 2;
                            const midY  = chartArea.top + (chartArea.bottom - chartArea.top) * 0.5;
                            const gapPx = bPoint.x - aPoint.x;

                            if (gapPx > 50) {
                                ctx.fillText('No data', midX, midY);
                            }
                        }

                        ctx.restore();
                    }
                }
            ]
        });

    } catch (error) {
        console.error('Error rendering weather chart:', error);
    }
}