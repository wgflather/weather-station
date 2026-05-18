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
        suggestedMin: Math.min(...values) - 2,
        suggestedMax: Math.max(...values) + 2
    };
}

/* =========================================================
   FIND MIN/MAX POINTS
========================================================= */
function getMinMaxPoints(points) {
    if (!points.length) {
        return { minIndex: -1, maxIndex: -1 };
    }

    let minIndex = 0;
    let maxIndex = 0;

    points.forEach((point, index) => {
        if (point.y < points[minIndex].y) minIndex = index;
        if (point.y > points[maxIndex].y) maxIndex = index;
    });

    return { minIndex, maxIndex };
}

/* =========================================================
   MIN / MAX LABEL CANVAS PLUGIN
========================================================= */
const minMaxLabelsPlugin = {
    id: 'minMaxLabels',
    afterDatasetsDraw(chart, args, pluginOptions) {
        const { ctx } = chart;
        const meta = chart.getDatasetMeta(0);

        if (!meta.data.length) return;

        const maxPoint = meta.data[pluginOptions.maxIndex];
        const minPoint = meta.data[pluginOptions.minIndex];

        ctx.save();
        ctx.font = '600 11px Nunito';
        ctx.textAlign = 'center';

        /* --- HIGH LABEL --- */
        ctx.fillStyle = pluginOptions.isTemp ? '#ffb199' : '#bae6fd';
        if (maxPoint) {
            ctx.fillText('H', maxPoint.x, maxPoint.y - 14);
        }

        /* --- LOW LABEL --- */
        ctx.fillStyle = pluginOptions.isTemp ? '#7dd3fc' : '#38bdf8';
        if (minPoint) {
            ctx.fillText('L', minPoint.x, minPoint.y - 14);
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
export function renderWeatherChart(backendData, metric = 'temperature') {
    try {
        /* =================================================
           MAP RAW DATA FROM DB
        ================================================= */
        const chartPoints = backendData.map(item => ({
            x: new Date(item.hour),
            y: item.hourlyValue
        }));

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        const yBounds = getDynamicYBounds(chartPoints);
        const { minIndex, maxIndex } = getMinMaxPoints(chartPoints);

        /* =================================================
           CONTEXTUAL CONFIGURATION DRIVER
        ================================================= */
        const isTemp = metric === 'temperature';
        
        // Metadata Strings
        const datasetLabel = isTemp ? 'Temperature' : 'Pressure';
        const tooltipSuffix = isTemp ? '°C' : ' hPa';
        const yAxisAxisSuffix = isTemp ? '°' : '';

        // Color Palettes
        const lineStrokeColor = isTemp ? '#ff8a65' : '#7dd3fc';
        const shadowGlowColor = isTemp ? 'rgba(255, 140, 100, 0.30)' : 'rgba(125, 211, 252, 0.30)';
        const maxCircleNode = isTemp ? '#ffb199' : '#bae6fd';
        const minCircleNode = isTemp ? '#7dd3fc' : '#38bdf8';
        const innerBorderNode = isTemp ? '#ffe5dc' : '#dff4ff';

        /* =================================================
           LIFECYCLE FIX: DESTROY PREVIOUS ENGINE CONTEXT
        ================================================= */
        if (weatherChartInstance !== null) {
            weatherChartInstance.destroy();
        }

        const canvasElement = document.getElementById('weatherChart');
        if (!canvasElement) {
            console.error("Target canvas with ID 'weatherChart' not found in DOM.");
            return;
        }
        const ctx = canvasElement.getContext('2d');

        /* =================================================
           AREA BACKGROUND GRADIENT CREATION
        ================================================= */
        const gradientFill = ctx.createLinearGradient(0, 0, 0, 350);
        if (isTemp) {
            gradientFill.addColorStop(0, 'rgba(255, 138, 101, 0.30)');
            gradientFill.addColorStop(0.45, 'rgba(255, 138, 101, 0.08)');
        } else {
            gradientFill.addColorStop(0, 'rgba(125, 211, 252, 0.25)');
            gradientFill.addColorStop(0.45, 'rgba(125, 211, 252, 0.06)');
        }
        gradientFill.addColorStop(1, 'rgba(255, 255, 255, 0.00)');

        /* =================================================
           INITIALIZE INSTANCE CONTEXT
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
                    tension: 0.42,
                    borderWidth: 2.8,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round',

                    /* --- POINT MATRIX CONFIGURATION --- */
                    pointRadius: (context) => {
                        const index = context.dataIndex;
                        const lastIndex = chartPoints.length - 1;

                        if (index === lastIndex) return 6; // Current reading node
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

                        if (index === lastIndex) return lineStrokeColor;
                        if (index === maxIndex) return innerBorderNode;
                        if (index === minIndex) return innerBorderNode;
                        return '#ffd0c2';
                    },
                    pointBorderWidth: (context) => {
                        return (context.dataIndex === chartPoints.length - 1) ? 3 : 2;
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
                    /* --- X AXIS DIMENSIONS --- */
                    x: {
                        type: 'time',
                        time: {
                            unit: 'hour',
                            displayFormats: { hour: 'H' },
                            tooltipFormat: 'HH:mm'
                        },
                        min: startOfDay,
                        max: endOfDay,
                        ticks: {
                            autoSkip: true,
                            maxTicksLimit: 8,
                            color: '#94a3b8',
                            font: { size: 11 }
                        },
                        grid: {
                            color: 'rgba(255,255,255,0.045)',
                            drawBorder: false
                        },
                        border: { display: false }
                    },
                    /* --- Y AXIS DIMENSIONS --- */
                    y: {
                        suggestedMin: yBounds.suggestedMin,
                        suggestedMax: yBounds.suggestedMax,
                        ticks: {
                            stepSize: isTemp ? 1 : 4, // Spread out steps wider for hPa integers
                            callback: (val) => `${val}${yAxisAxisSuffix}`,
                            color: '#94a3b8',
                            font: { size: 11 }
                        },
                        grid: {
                            color: 'rgba(255,255,255,0.045)',
                            drawBorder: false
                        },
                        border: { display: false }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(12, 20, 42, 0.94)',
                        borderColor: 'rgba(255,255,255,0.10)',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false,
                        titleColor: '#ffffff',
                        bodyColor: '#e2e8f0',
                        titleFont: { size: 12, weight: '600' },
                        bodyFont: { size: 14, weight: '700' },
                        callbacks: {
                            title: (items) => {
                                if (!items.length) return '';
                                const date = new Date(items[0].parsed.x);
                                return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            },
                            label: (context) => {
                                return ` ${context.parsed.y.toFixed(1)}${tooltipSuffix}`;
                            }
                        }
                    },
                    /* --- INJECT FLAGS TO CANVAS HOOKS --- */
                    minMaxLabels: {
                        minIndex,
                        maxIndex,
                        isTemp
                    }
                }
            },
            plugins: [{
                id: 'lineGlow',
                beforeDatasetDraw(chart) {
                    const { ctx } = chart;
                    ctx.save();
                    ctx.shadowColor = shadowGlowColor;
                    ctx.shadowBlur = 12;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                },
                afterDatasetDraw(chart) {
                    chart.ctx.restore();
                }
            }]
        });

    } catch (error) {
        console.error('Error rendering chart timeline state:', error);
    }
}