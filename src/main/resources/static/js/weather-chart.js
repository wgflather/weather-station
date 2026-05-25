let weatherChartInstance = null;

/* =========================================================
   DYNAMIC Y AXIS BOUNDS
========================================================= */
function getDynamicYBounds(points) {
    if (!points || points.length === 0) {
        return { suggestedMin: 10, suggestedMax: 30 };
    }

    const values = points.map(p => p.y);

    return {
        suggestedMin: Math.min(...values) - 1,
        suggestedMax: Math.max(...values) + 1
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
    const valueDelta = Math.abs(points[maxIndex].y - points[minIndex].y);

    const isTooClose = indexDistance <= 1 || valueDelta < 0.2;

    return { minIndex, maxIndex, isTooClose };
}

/* =========================================================
   MIN / MAX / NOW LABELS PLUGIN
========================================================= */
const minMaxLabelsPlugin = {
    id: 'minMaxLabels',

    afterDatasetsDraw(chart, args, pluginOptions) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);

        if (!meta.data || !meta.data.length) return;

        const {
            minIndex,
            maxIndex,
            isTooClose,
            isTemp,
            latestIndex
        } = pluginOptions;

        if (
            minIndex === -1 ||
            maxIndex === -1 ||
            minIndex === maxIndex
        ) {
            return;
        }

        const maxPoint = meta.data[maxIndex];
        const minPoint = meta.data[minIndex];
        const latestPoint = meta.data[latestIndex];

        ctx.save();

        ctx.font = '700 11px Nunito';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        /* =================================================
           HIGH LABEL
        ================================================= */
        if (maxPoint) {
            ctx.fillStyle = isTemp ? '#ffb199' : '#bae6fd';

            let yOffset = -14;

            // Prevent collision with NOW label
            if (latestIndex === maxIndex) {
                yOffset = -14;
            }

            ctx.fillText('H', maxPoint.x, maxPoint.y + yOffset);
        }

        /* =================================================
           LOW LABEL
        ================================================= */
        if (minPoint) {
            ctx.fillStyle = isTemp ? '#7dd3fc' : '#38bdf8';

            let yOffset = isTooClose ? 16 : -14;

            // Prevent collision with NOW label
            if (latestIndex === minIndex) {
                yOffset = 18;
            }

            ctx.fillText('L', minPoint.x, minPoint.y + yOffset);
        }

        /* =================================================
           NOW LABEL
        ================================================= */
        if (latestPoint) {
            ctx.fillStyle = '#ffffff';
            ctx.font = '700 10px Nunito';

            let nowOffset = -28;

            // Stack above H
            if (latestIndex === maxIndex) {
                nowOffset = -42;
            }

            // Stack around L
            if (latestIndex === minIndex) {
                nowOffset = isTooClose ? 34 : -28;
            }

            ctx.fillText(
                'Now',
                latestPoint.x,
                latestPoint.y + nowOffset
            );
        }

        ctx.restore();
    }
};

/* =========================================================
   REGISTER BASE PLUGINS
========================================================= */
Chart.register(minMaxLabelsPlugin);

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

        const {
            minIndex,
            maxIndex,
            isTooClose
        } = getMinMaxPoints(chartPoints);

        /* =================================================
           CONTEXT DRIVER
        ================================================= */
        const isTemp = metric === 'temperature';

        const datasetLabel = isTemp
            ? 'Temperature'
            : 'Pressure';

        const tooltipSuffix = isTemp
            ? '°C'
            : ' hPa';

        const yAxisSuffix = isTemp
            ? '°'
            : '';

        /* =================================================
           COLOR PALETTE
        ================================================= */
        const lineStrokeColor = isTemp
            ? '#ff8a65'
            : '#7dd3fc';

        const shadowGlowColor = isTemp
            ? 'rgba(255, 140, 100, 0.30)'
            : 'rgba(125, 211, 252, 0.30)';

        const maxCircleNode = isTemp
            ? '#ffb199'
            : '#bae6fd';

        const minCircleNode = isTemp
            ? '#7dd3fc'
            : '#38bdf8';

        const innerBorderNode = isTemp
            ? '#ffe5dc'
            : '#dff4ff';

        /* =================================================
           DESTROY PREVIOUS INSTANCE
        ================================================= */
        if (weatherChartInstance !== null) {
            weatherChartInstance.destroy();
        }

        const canvasElement = document.getElementById('weatherChart');

        if (!canvasElement) {
            console.error(
                "Canvas with ID 'weatherChart' not found."
            );
            return;
        }

        const ctx = canvasElement.getContext('2d');

        /* =================================================
           AREA GRADIENT
        ================================================= */
        const gradientFill = ctx.createLinearGradient(
            0,
            0,
            0,
            350
        );

        if (isTemp) {
            gradientFill.addColorStop(
                0,
                'rgba(255, 138, 101, 0.30)'
            );

            gradientFill.addColorStop(
                0.45,
                'rgba(255, 138, 101, 0.08)'
            );
        } else {
            gradientFill.addColorStop(
                0,
                'rgba(125, 211, 252, 0.25)'
            );

            gradientFill.addColorStop(
                0.45,
                'rgba(125, 211, 252, 0.06)'
            );
        }

        gradientFill.addColorStop(
            1,
            'rgba(255,255,255,0)'
        );

        /* =================================================
           CREATE CHART
        ================================================= */
        weatherChartInstance = new Chart(ctx, {
            type: 'line',

            data: {
                datasets: [{
                    label: datasetLabel,
                    data: chartPoints,

                    borderColor: lineStrokeColor,
                    backgroundColor: gradientFill,

                    fill: true,

                    tension: 0.53,
                    cubicInterpolationMode: 'monotone',

                    borderWidth: 2.8,

                    borderCapStyle: 'round',
                    borderJoinStyle: 'round',

                    /* =========================================
                       POINTS
                    ========================================= */
                    pointRadius: (context) => {
                        const index = context.dataIndex;
                        const lastIndex = chartPoints.length - 1;

                        if (index === lastIndex) return 6;
                        if (index === maxIndex) return 3.5;
                        if (index === minIndex) return 3.5;

                        return 0;
                    },

                    pointHoverRadius: 6,

                    pointBackgroundColor: (context) => {
                        const index = context.dataIndex;
                        const lastIndex = chartPoints.length - 1;

                        if (index === lastIndex) return '#ffffff';
                        if (index === maxIndex) return maxCircleNode;
                        if (index === minIndex) return minCircleNode;

                        return lineStrokeColor;
                    },

                    pointBorderColor: (context) => {
                        const index = context.dataIndex;
                        const lastIndex = chartPoints.length - 1;

                        if (index === lastIndex) {
                            return lineStrokeColor;
                        }

                        if (index === maxIndex) {
                            return innerBorderNode;
                        }

                        if (index === minIndex) {
                            return innerBorderNode;
                        }

                        return '#ffd0c2';
                    },

                    pointBorderWidth: (context) => {
                        return (
                            context.dataIndex ===
                            chartPoints.length - 1
                        )
                            ? 3
                            : 2;
                    }
                }]
            },

            options: {
                responsive: true,
                maintainAspectRatio: false,

                interaction: {
                    intersect: false,
                    mode: 'index'
                },

                animations: {
                    tension: {
                        duration: 1200,
                        easing: 'easeOutQuart',
                        from: 0.2,
                        to: 0.42
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
                            displayFormats: {
                                hour: 'H'
                            },
                            tooltipFormat: 'HH:mm'
                        },

                        min: startRange,
                        max: endRange,

                        ticks: {
                            autoSkip: true,
                            maxTicksLimit: 8,

                            color: '#94a3b8',

                            font: {
                                size: 11
                            }
                        },

                        grid: {
                            color: 'rgba(255,255,255,0.045)',
                            drawBorder: false
                        },

                        border: {
                            display: false
                        }
                    },

                    /* =========================================
                       Y AXIS
                    ========================================= */
                    y: {
                        suggestedMin: yBounds.suggestedMin,
                        suggestedMax: yBounds.suggestedMax,

                        ticks: {
                            stepSize: isTemp ? 1 : 4,

                            callback: (val) =>
                                `${val}${yAxisSuffix}`,

                            color: '#94a3b8',

                            font: {
                                size: 11
                            }
                        },

                        grid: {
                            color: 'rgba(255,255,255,0.045)',
                            drawBorder: false
                        },

                        border: {
                            display: false
                        }
                    }
                },

                plugins: {

                    legend: {
                        display: false
                    },

                    tooltip: {
                        backgroundColor:
                            'rgba(12, 20, 42, 0.94)',

                        borderColor:
                            'rgba(255,255,255,0.10)',

                        borderWidth: 1,

                        padding: 12,

                        displayColors: false,

                        titleColor: '#ffffff',
                        bodyColor: '#e2e8f0',

                        titleFont: {
                            size: 12,
                            weight: '600'
                        },

                        bodyFont: {
                            size: 14,
                            weight: '700'
                        },

                        callbacks: {

                            title: (items) => {
                                if (!items.length) return '';

                                const date = new Date(
                                    items[0].parsed.x
                                );

                                return date.toLocaleTimeString(
                                    [],
                                    {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    }
                                );
                            },

                            label: (context) => {
                                return ` ${context.parsed.y.toFixed(1)}${tooltipSuffix}`;
                            }
                        }
                    },

                    minMaxLabels: {
                        minIndex,
                        maxIndex,
                        isTooClose,
                        isTemp,
                        latestIndex:
                            chartPoints.length - 1
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

                        const {
                            ctx,
                            chartArea,
                            scales
                        } = chart;

                        const latestPoint =
                            chartPoints[
                                chartPoints.length - 1
                            ];

                        const latestX =
                            scales.x.getPixelForValue(
                                latestPoint.x
                            );

                        ctx.save();

                        /* =====================================
                           GREY FUTURE REGION
                        ===================================== */
                        ctx.fillStyle =
                            'rgba(255,255,255,0.045)';

                        ctx.fillRect(
                            latestX,
                            chartArea.top,
                            chartArea.right - latestX,
                            chartArea.bottom - chartArea.top
                        );

                        /* =====================================
                           NOW DIVIDER
                        ===================================== */
                        ctx.beginPath();

                        ctx.moveTo(
                            latestX,
                            chartArea.top
                        );

                        ctx.lineTo(
                            latestX,
                            chartArea.bottom
                        );

                        ctx.strokeStyle =
                            'rgba(255,255,255,0.10)';

                        ctx.lineWidth = 1;

                        ctx.setLineDash([4, 4]);

                        ctx.stroke();

                        /* =====================================
                           NOW LABEL
                        ===================================== */
                        ctx.fillStyle =
                            'rgba(255,255,255,0.45)';

                        ctx.font =
                            '600 10px Nunito';

                        ctx.fillText(
                            'NOW',
                            latestX + 8,
                            chartArea.top + 14
                        );

                        ctx.restore();
                    }
                },

                /* =============================================
                   LINE GLOW
                ============================================= */
                {
                    id: 'lineGlow',

                    beforeDatasetDraw(chart) {
                        const { ctx } = chart;

                        ctx.save();

                        ctx.shadowColor =
                            shadowGlowColor;

                        ctx.shadowBlur = 12;

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

        console.error(
            'Error rendering weather chart:',
            error
        );
    }
}