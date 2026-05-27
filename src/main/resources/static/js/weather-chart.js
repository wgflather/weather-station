let weatherChartInstance = null;

/* =========================================================
   TEMPERATURE COLOR SCALE
   Maps a temperature value to an RGB color.
   Scale anchors:
     ≤ -20°C  →  #3b82f6  (cold blue)
       -5°C   →  #93c5fd  (light blue)
        5°C   →  #e0f2fe  (ice white-blue)
       15°C   →  #fde68a  (pale yellow)
       25°C   →  #fb923c  (warm orange)
     ≥  35°C  →  #ef4444  (hot red)
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

    if (temp <= scale[0].temp) {
        const s = scale[0];
        return { r: s.r, g: s.g, b: s.b };
    }

    if (temp >= scale[scale.length - 1].temp) {
        const s = scale[scale.length - 1];
        return { r: s.r, g: s.g, b: s.b };
    }

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
    return alpha < 1
        ? `rgba(${r},${g},${b},${alpha})`
        : `rgb(${r},${g},${b})`;
}

/* =========================================================
   DYNAMIC Y AXIS BOUNDS
========================================================= */
function getDynamicYBounds(points) {
    if (!points || points.length === 0) {
        return { suggestedMin: 10, suggestedMax: 30 };
    }

    const values = points.map(p => p.y);

    return {
        suggestedMin: Math.min(...values) - 2,
        suggestedMax: Math.max(...values) + 2
    };
}

/* =========================================================
   FIND MIN/MAX POINTS WITH DISTANCE PROTECTION
========================================================= */
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

    const isTooClose = indexDistance <= 2 || valueDelta < 0.2;

    return { minIndex, maxIndex, isTooClose };
}

/* =========================================================
   DURATION GUARD — show H/L only if ≥ 90 min of data
========================================================= */
function hasEnoughDataDuration(backendData) {
    if (!backendData || backendData.length < 2) return false;

    const first          = new Date(backendData[0].hour).getTime();
    const last           = new Date(backendData[backendData.length - 1].hour).getTime();
    const elapsedMinutes = (last - first) / 60000;

    return elapsedMinutes >= 90;
}

/* =========================================================
   TEMPERATURE GRADIENT LINE PLUGIN
   Replaces the default Chart.js stroke with per-segment
   color derived from the midpoint temperature value.
   Runs after Chart.js has drawn the fill area but the
   original (transparent) border line is invisible.
========================================================= */
const tempGradientLinePlugin = {
    id: 'tempGradientLine',

    afterDatasetsDraw(chart, args, pluginOptions) {
        if (!pluginOptions.enabled) return;

        const { ctx, scales } = chart;
        const meta            = chart.getDatasetMeta(0);

        if (!meta.data || meta.data.length < 2) return;

        const points     = pluginOptions.chartPoints;
        const lineWidth  = pluginOptions.lineWidth  ?? 2.8;
        const glowColor  = pluginOptions.glowColor;

        ctx.save();

        // Glow pass — draw a wider blurred stroke first
        if (glowColor) {
            ctx.shadowColor   = glowColor;
            ctx.shadowBlur    = 14;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }

        ctx.lineWidth    = lineWidth;
        ctx.lineCap      = 'round';
        ctx.lineJoin     = 'round';

        /* -------------------------------------------------
           Walk each consecutive pair of canvas points.
           Use the midpoint temperature to pick the segment
           color so transitions are smooth.
        ------------------------------------------------- */
        for (let i = 0; i < meta.data.length - 1; i++) {
            const pxA = meta.data[i];
            const pxB = meta.data[i + 1];

            const tempA = points[i].y;
            const tempB = points[i + 1].y;
            const mid   = (tempA + tempB) / 2;

            /* Segment-level linear gradient from A color → B color
               for a smoother blend between adjacent segments       */
            const grad = ctx.createLinearGradient(pxA.x, pxA.y, pxB.x, pxB.y);
            grad.addColorStop(0, tempToRgbString(tempA));
            grad.addColorStop(1, tempToRgbString(tempB));

            ctx.beginPath();
            ctx.strokeStyle = grad;

            /* Approximate the Bézier curve that Chart.js drew.
               Chart.js exposes the control points via
               pxA.cp2 (exit handle from A) and pxB.cp1 (entry handle to B). */
            ctx.moveTo(pxA.x, pxA.y);

            if (pxA.cp2 && pxB.cp1) {
                ctx.bezierCurveTo(
                    pxA.cp2.x, pxA.cp2.y,
                    pxB.cp1.x, pxB.cp1.y,
                    pxB.x,     pxB.y
                );
            } else {
                ctx.lineTo(pxB.x, pxB.y);
            }

            ctx.stroke();
        }

        ctx.restore();
    }
};

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
            minIndex,
            maxIndex,
            isTooClose,
            isTemp,
            latestIndex,
            showMinMax,
            chartPoints
        } = pluginOptions;

        const renderMinMax = showMinMax &&
            minIndex !== -1 &&
            maxIndex !== -1 &&
            minIndex !== maxIndex;

        const maxPoint    = meta.data[maxIndex];
        const minPoint    = meta.data[minIndex];
        const latestPoint = meta.data[latestIndex];

        ctx.save();

        ctx.font         = '700 11px Nunito';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        /* =================================================
           HIGH LABEL — color derived from actual max temp
        ================================================= */
        if (renderMinMax && maxPoint) {
            // For temp mode use the scale color, else static
            ctx.fillStyle = isTemp
                ? tempToRgbString(chartPoints[maxIndex].y)
                : '#bae6fd';

            let yOffset = -14;
            if (latestIndex === maxIndex) yOffset = -14;

            ctx.fillText('H', maxPoint.x, maxPoint.y + yOffset);
        }

        /* =================================================
           LOW LABEL — color derived from actual min temp
        ================================================= */
        if (renderMinMax && minPoint) {
            ctx.fillStyle = isTemp
                ? tempToRgbString(chartPoints[minIndex].y)
                : '#38bdf8';

            let yOffset = isTooClose ? 16 : -14;
            if (latestIndex === minIndex) yOffset = 18;

            ctx.fillText('L', minPoint.x, minPoint.y + yOffset);
        }

        /* =================================================
           NOW LABEL
        ================================================= */
        if (latestPoint) {
            ctx.fillStyle = '#ffffff';
            ctx.font      = '700 10px Nunito';

            let nowOffset = -28;

            if (renderMinMax && latestIndex === maxIndex) nowOffset = -42;
            if (renderMinMax && latestIndex === minIndex) {
                nowOffset = isTooClose ? 34 : -28;
            }

            ctx.fillText('Now', latestPoint.x, latestPoint.y + nowOffset);
        }

        ctx.restore();
    }
};

/* =========================================================
   REGISTER BASE PLUGINS
========================================================= */
Chart.register(minMaxLabelsPlugin);
Chart.register(tempGradientLinePlugin);

/* =========================================================
   MAIN CHART RENDER ENGINE
========================================================= */
export function renderWeatherChart(
    backendData,
    metric = 'temperature'
) {
    try {

        /* =================================================
           MAP RAW DATA
        ================================================= */
        const chartPoints = (backendData || []).map(item => ({
            x: new Date(item.hour),
            y: item.hourlyValue
        }));

        /* =================================================
           FIXED DAY RANGE (00:00 → 23:59)
        ================================================= */
        const today = new Date();

        const startRange = new Date(today);
        startRange.setHours(0, 0, 0, 0);

        const endRange = new Date(today);
        endRange.setHours(23, 59, 59, 999);

        /* =================================================
           BOUNDS + EXTREMES
        ================================================= */
        const yBounds = getDynamicYBounds(chartPoints);

        const { minIndex, maxIndex, isTooClose } = getMinMaxPoints(chartPoints);

        const showMinMax = hasEnoughDataDuration(backendData);

        /* =================================================
           CONTEXT DRIVER
        ================================================= */
        const isTemp = metric === 'temperature';

        const datasetLabel  = isTemp ? 'Temperature' : 'Pressure';
        const tooltipSuffix = isTemp ? '°C'          : ' hPa';
        const yAxisSuffix   = isTemp ? '°'            : '';

        /* =================================================
           COLOR PALETTE
        ================================================= */
        // For temp mode the line is drawn transparent — the
        // tempGradientLine plugin renders the colored stroke instead.
        const lineStrokeColor = isTemp ? 'transparent'                 : '#7dd3fc';
        const shadowGlowColor = isTemp ? 'rgba(255, 140, 100, 0.30)'  : 'rgba(125, 211, 252, 0.30)';
        const maxCircleNode   = isTemp
            ? tempToRgbString(chartPoints[maxIndex]?.y ?? 20)
            : '#bae6fd';
        const minCircleNode   = isTemp
            ? tempToRgbString(chartPoints[minIndex]?.y ?? 10)
            : '#38bdf8';
        const innerBorderNode = isTemp ? '#ffe5dc' : '#dff4ff';

        /* =================================================
           DESTROY PREVIOUS INSTANCE
        ================================================= */
        if (weatherChartInstance !== null) {
            weatherChartInstance.destroy();
        }

        const canvasElement = document.getElementById('weatherChart');

        if (!canvasElement) {
            console.error("Canvas with ID 'weatherChart' not found.");
            return;
        }

        const ctx = canvasElement.getContext('2d');

        /* =================================================
           AREA GRADIENT
           For temp: build a vertical gradient tinted by
           the average temperature color of the dataset.
        ================================================= */
        const gradientFill = ctx.createLinearGradient(0, 0, 0, 350);

        if (isTemp) {
            const avgTemp = chartPoints.length
                ? chartPoints.reduce((s, p) => s + p.y, 0) / chartPoints.length
                : 15;

            const topColor    = tempToRgbString(avgTemp, 0.28);
            const midColor    = tempToRgbString(avgTemp, 0.07);

            gradientFill.addColorStop(0,    topColor);
            gradientFill.addColorStop(0.5,  midColor);
            gradientFill.addColorStop(1,    'rgba(255,255,255,0)');
        } else {
            gradientFill.addColorStop(0,    'rgba(125, 211, 252, 0.25)');
            gradientFill.addColorStop(0.45, 'rgba(125, 211, 252, 0.06)');
            gradientFill.addColorStop(1,    'rgba(255,255,255,0)');
        }

        /* =================================================
           CREATE CHART
        ================================================= */
        weatherChartInstance = new Chart(ctx, {
            type: 'line',

            data: {
                datasets: [{
                    label:           datasetLabel,
                    data:            chartPoints,

                    // Transparent for temp — gradient plugin draws the line
                    borderColor:     lineStrokeColor,
                    backgroundColor: gradientFill,

                    fill: true,

                    tension: 0.45,

                    borderWidth: 2.8,

                    borderCapStyle:  'round',
                    borderJoinStyle: 'round',

                    /* =========================================
                       POINTS
                    ========================================= */
                    pointRadius: (context) => {
                        const index     = context.dataIndex;
                        const lastIndex = chartPoints.length - 1;

                        if (index === lastIndex) return 6;
                        if (index === maxIndex)  return 3.5;
                        if (index === minIndex)  return 3.5;

                        return 0;
                    },

                    pointHoverRadius: 6,

                    pointBackgroundColor: (context) => {
                        const index     = context.dataIndex;
                        const lastIndex = chartPoints.length - 1;

                        if (index === lastIndex) return '#ffffff';
                        if (index === maxIndex)  return maxCircleNode;
                        if (index === minIndex)  return minCircleNode;

                        return lineStrokeColor;
                    },

                    pointBorderColor: (context) => {
                        const index     = context.dataIndex;
                        const lastIndex = chartPoints.length - 1;

                        if (index === lastIndex) return isTemp
                            ? tempToRgbString(chartPoints[lastIndex].y)
                            : lineStrokeColor;
                        if (index === maxIndex)  return innerBorderNode;
                        if (index === minIndex)  return innerBorderNode;

                        return '#ffd0c2';
                    },

                    pointBorderWidth: (context) => {
                        return (context.dataIndex === chartPoints.length - 1) ? 3 : 2;
                    }
                }]
            },

            options: {
                responsive:          true,
                maintainAspectRatio: false,

                interaction: {
                    intersect: false,
                    mode:      'index'
                },

                animations: {
                    tension: {
                        duration: 1200,
                        easing:   'easeOutQuart',
                        from: 0.2,
                        to:   0.45
                    }
                },

                scales: {

                    /* =========================================
                       X AXIS
                    ========================================= */
                    x: {
                        type: 'time',

                        time: {
                            unit: 'hour',
                            displayFormats: { hour: 'H' },
                            tooltipFormat:  'HH:mm'
                        },

                        min: startRange,
                        max: endRange,

                        ticks: {
                            stepSize: 3,
                            color:    '#94a3b8',
                            font:     { size: 11 }
                        },

                        grid: {
                            color:      'rgba(255,255,255,0.045)',
                            drawBorder: false
                        },

                        border: { display: false }
                    },

                    /* =========================================
                       Y AXIS
                    ========================================= */
                    y: {
                        suggestedMin: yBounds.suggestedMin,
                        suggestedMax: yBounds.suggestedMax,

                        ticks: {
                            stepSize: isTemp ? 1 : 4,
                            callback: (val) => `${val}${yAxisSuffix}`,
                            color:    '#94a3b8',
                            font:     { size: 11 }
                        },

                        grid: {
                            color:      'rgba(255,255,255,0.045)',
                            drawBorder: false
                        },

                        border: { display: false }
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
                                const date = new Date(items[0].parsed.x);
                                return date.toLocaleTimeString([], {
                                    hour:   '2-digit',
                                    minute: '2-digit'
                                });
                            },
                            label: (context) => {
                                return ` ${context.parsed.y.toFixed(1)}${tooltipSuffix}`;
                            }
                        }
                    },

                    /* =========================================
                       PASS OPTIONS INTO REGISTERED PLUGINS
                    ========================================= */
                    minMaxLabels: {
                        minIndex,
                        maxIndex,
                        isTooClose,
                        isTemp,
                        latestIndex: chartPoints.length - 1,
                        showMinMax,
                        chartPoints
                    },

                    tempGradientLine: {
                        enabled:     isTemp,
                        chartPoints,
                        lineWidth:   2.8,
                        glowColor:   isTemp ? 'rgba(255,160,120,0.25)' : null
                    }
                }
            },

            plugins: [

                /* =============================================
                   FUTURE AREA OVERLAY
                ============================================= */
                {
                    id: 'futureAreaOverlay',

                    beforeDatasetsDraw(chart) {
                        if (!chartPoints.length) return;

                        const { ctx, chartArea, scales } = chart;
                        const latestPoint  = chartPoints[chartPoints.length - 1];
                        const latestX      = scales.x.getPixelForValue(latestPoint.x);
                        const overlayStart = latestX + 3;

                        ctx.save();

                        ctx.fillStyle = 'rgba(255,255,255,0.045)';
                        ctx.fillRect(
                            overlayStart,
                            chartArea.top,
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

                /* =============================================
                   LINE GLOW  (pressure mode only —
                   temp glow is handled inside tempGradientLine)
                ============================================= */
                {
                    id: 'lineGlow',

                    beforeDatasetDraw(chart) {
                        if (isTemp) return; // gradient plugin owns glow for temp

                        const { ctx } = chart;
                        ctx.save();
                        ctx.shadowColor   = shadowGlowColor;
                        ctx.shadowBlur    = 12;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                    },

                    afterDatasetDraw(chart) {
                        if (!isTemp) chart.ctx.restore();
                    }
                }
            ]
        });

    } catch (error) {
        console.error('Error rendering weather chart:', error);
    }
}