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
   Single source of truth for per-metric colors/labels/units.
   Add new metrics here — nothing else needs to change.
========================================================= */
const METRIC_CONFIG = {
    temperature: {
        label:          'Temperature',
        tooltipSuffix:  '°C',
        yAxisSuffix:    '°',
        yStep:          1,
        // Line color is dynamic (gradient) — handled separately
        lineColor:      null,
        shadowColor:    'rgba(255, 120, 90, 0.25)',
        fillTop:        null,   // computed from avg temp
        fillMid:        null,
        maxNodeColor:   '#ef4444',
        minNodeColor:   '#3b82f6',
        innerBorder:    '#ffffff',
    },
    pressure: {
        label:          'Pressure',
        tooltipSuffix:  ' hPa',
        yAxisSuffix:    '',
        yStep:          4,
        lineColor:      '#cbd5e1',                      // slate-200 — neutral/atmospheric
        shadowColor:    'rgba(203, 213, 225, 0.20)',
        fillTop:        'rgba(203, 213, 225, 0.22)',
        fillMid:        'rgba(203, 213, 225, 0.05)',
        maxNodeColor:   '#e2e8f0',
        minNodeColor:   '#94a3b8',
        innerBorder:    '#f8fafc',
    },
    humidity: {
        label:          'Humidity',
        tooltipSuffix:  '%',
        yAxisSuffix:    '%',
        yStep:          5,
        lineColor:      '#38bdf8',                      // sky-400 — water/moisture
        shadowColor:    'rgba(56, 189, 248, 0.25)',
        fillTop:        'rgba(56, 189, 248, 0.22)',
        fillMid:        'rgba(56, 189, 248, 0.05)',
        maxNodeColor:   '#7dd3fc',
        minNodeColor:   '#0ea5e9',
        innerBorder:    '#e0f2fe',
    },
};

/* =========================================================
   DYNAMIC Y AXIS BOUNDS
========================================================= */
function getDynamicYBounds(points, metric) {
    if (!points || points.length === 0) {
        if (metric === 'humidity') return { suggestedMin: 20, suggestedMax: 100 };
        if (metric === 'pressure') return { suggestedMin: 990, suggestedMax: 1030 };
        return { suggestedMin: 10, suggestedMax: 30 };
    }
    const values = points.map(p => p.y);
    const pad = metric === 'humidity' ? 3 : metric === 'pressure' ? 2 : 2;
    return {
        suggestedMin: Math.min(...values) - pad,
        suggestedMax: Math.max(...values) + pad,
    };
}

function getMinMaxPoints(points) {
    if (!points || points.length === 0) {
        return { minIndex: -1, maxIndex: -1, isTooClose: false };
    }
    let minIndex = 0;
    let maxIndex = 0;
    points.forEach((point, index) => {
        if (point.y < points[minIndex].y) minIndex = index;
        if (point.y > points[maxIndex].y) maxIndex = index;
    });
    const indexDistance = Math.abs(maxIndex - minIndex);
    const valueDelta    = Math.abs(points[maxIndex].y - points[minIndex].y);
    const isTooClose    = indexDistance <= 2 || valueDelta < 0.2;
    return { minIndex, maxIndex, isTooClose };
}

function hasEnoughDataDuration(backendData) {
    if (!backendData || backendData.length < 2) return false;
    const first = new Date(backendData[0].hour).getTime();
    const last  = new Date(backendData[backendData.length - 1].hour).getTime();
    return ((last - first) / 60000) >= 90;
}

/* =========================================================
   TEMPERATURE GRADIENT (only used for temperature metric)
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
        const { ctx }  = chart;
        const meta     = chart.getDatasetMeta(0);
        if (!meta.data || !meta.data.length) return;

        const {
            minIndex, maxIndex, isTooClose,
            latestIndex, showMinMax,
            maxLabelColor, minLabelColor,
        } = pluginOptions;

        const renderMinMax  = showMinMax && minIndex !== -1 && maxIndex !== -1 && minIndex !== maxIndex;
        const maxPoint      = meta.data[maxIndex];
        const minPoint      = meta.data[minIndex];
        const latestPoint   = meta.data[latestIndex];

        ctx.save();
        ctx.font         = '700 11px Nunito';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        if (renderMinMax && maxPoint) {
            ctx.fillStyle = maxLabelColor;
            ctx.fillText('H', maxPoint.x, maxPoint.y + (latestIndex === maxIndex ? -22 : -20));
        }

        if (renderMinMax && minPoint) {
            ctx.fillStyle = minLabelColor;
            const yOffset = isTooClose ? 24 : 20;
            ctx.fillText('L', minPoint.x, minPoint.y + (latestIndex === minIndex ? 26 : yOffset));
        }

        if (latestPoint) {
            ctx.fillStyle = '#ffffff';
            ctx.font      = '700 10px Nunito';
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
export function renderWeatherChart(backendData, metric = 'temperature') {
    try {
        const config = METRIC_CONFIG[metric] ?? METRIC_CONFIG.temperature;
        const isTemp = metric === 'temperature';

        const chartPoints = (backendData || []).map(item => ({
            x: new Date(item.hour),
            y: item.hourlyValue,
        }));

        const today      = new Date();
        const startRange = new Date(today); startRange.setHours(0, 0, 0, 0);
        const endRange   = new Date(today); endRange.setHours(23, 59, 59, 999);

        const yBounds              = getDynamicYBounds(chartPoints, metric);
        const { minIndex, maxIndex, isTooClose } = getMinMaxPoints(chartPoints);
        const showMinMax           = hasEnoughDataDuration(backendData);

        if (weatherChartInstance !== null) {
            weatherChartInstance.destroy();
        }

        const canvasElement = document.getElementById('weatherChart');
        if (!canvasElement) {
            console.error("Canvas with ID 'weatherChart' not found.");
            return;
        }

        const ctx          = canvasElement.getContext('2d');
        const gradientFill = ctx.createLinearGradient(0, 0, 0, 350);

        if (isTemp) {
            const avgTemp  = chartPoints.length
                ? chartPoints.reduce((s, p) => s + p.y, 0) / chartPoints.length
                : 15;
            gradientFill.addColorStop(0,   tempToRgbString(avgTemp, 0.28));
            gradientFill.addColorStop(0.5, tempToRgbString(avgTemp, 0.07));
            gradientFill.addColorStop(1,   'rgba(255,255,255,0)');
        } else {
            gradientFill.addColorStop(0,    config.fillTop);
            gradientFill.addColorStop(0.45, config.fillMid);
            gradientFill.addColorStop(1,    'rgba(255,255,255,0)');
        }

        weatherChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: config.label,
                    data:  chartPoints,

                    borderColor: (context) => {
                        if (!isTemp) return config.lineColor;
                        const chart = context.chart;
                        const { ctx, chartArea, scales } = chart;
                        if (!chartArea) return '#7dd3fc';
                        return createDynamicGradient(ctx, chartArea, scales.y);
                    },

                    backgroundColor:  gradientFill,
                    fill:             true,
                    tension:          0.45,
                    borderWidth:      2.8,
                    borderCapStyle:   'round',
                    borderJoinStyle:  'round',

                    pointRadius: (context) => {
                        const i = context.dataIndex;
                        const last = chartPoints.length - 1;
                        if (i === last)     return 6;
                        if (i === maxIndex) return 4.5;
                        if (i === minIndex) return 4.5;
                        return 0;
                    },
                    pointHoverRadius: 6,

                    pointBackgroundColor: (context) => {
                        const i    = context.dataIndex;
                        const last = chartPoints.length - 1;
                        if (i === last)     return '#ffffff';
                        if (i === maxIndex) return config.maxNodeColor;
                        if (i === minIndex) return config.minNodeColor;
                        return config.lineColor ?? '#7dd3fc';
                    },

                    pointBorderColor: (context) => {
                        const i    = context.dataIndex;
                        const last = chartPoints.length - 1;
                        if (i === last) return isTemp
                            ? tempToRgbString(chartPoints[last].y)
                            : config.lineColor;
                        if (i === maxIndex) return config.innerBorder;
                        if (i === minIndex) return config.innerBorder;
                        return config.lineColor ?? '#7dd3fc';
                    },

                    pointBorderWidth: (context) => {
                        return context.dataIndex === chartPoints.length - 1 ? 3 : 2;
                    },
                }]
            },
            options: {
                responsive:          true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                animations: {
                    tension: {
                        duration: 1200,
                        easing:   'easeOutQuart',
                        from:     0.2,
                        to:       0.45,
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
                        min: startRange,
                        max: endRange,
                        ticks: { stepSize: 3, color: '#94a3b8', font: { size: 11 } },
                        grid:  { color: 'rgba(255,255,255,0.045)', drawBorder: false },
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
                        callbacks: {
                            title: (items) => {
                                if (!items.length) return '';
                                return new Date(items[0].parsed.x).toLocaleTimeString([], {
                                    hour: '2-digit', minute: '2-digit',
                                });
                            },
                            label: (context) => ` ${context.parsed.y.toFixed(1)}${config.tooltipSuffix}`,
                        }
                    },
                    minMaxLabels: {
                        minIndex,
                        maxIndex,
                        isTooClose,
                        latestIndex:   chartPoints.length - 1,
                        showMinMax,
                        maxLabelColor: config.maxNodeColor,
                        minLabelColor: config.minNodeColor,
                    }
                }
            },
            plugins: [
                {
                    id: 'futureAreaOverlay',
                    beforeDatasetsDraw(chart) {
                        if (!chartPoints.length) return;
                        const { ctx, chartArea, scales } = chart;
                        const latestX    = scales.x.getPixelForValue(chartPoints[chartPoints.length - 1].x);
                        const overlayStart = latestX + 3;
                        ctx.save();
                        ctx.fillStyle = 'rgba(255,255,255,0.045)';
                        ctx.fillRect(overlayStart, chartArea.top, chartArea.right - overlayStart, chartArea.bottom - chartArea.top);
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
                {
                    id: 'lineGlow',
                    beforeDatasetDraw(chart) {
                        const { ctx } = chart;
                        ctx.save();
                        ctx.shadowColor   = config.shadowColor;
                        ctx.shadowBlur    = 12;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                    },
                    afterDatasetDraw(chart) {
                        chart.ctx.restore();
                    }
                }
            ]
        });

    } catch (error) {
        console.error('Error rendering weather chart:', error);
    }
}