let weatherChartInstance = null;

/* =========================================================
   DYNAMIC Y AXIS BOUNDS
========================================================= */

function getDynamicYBounds(points) {

    if (!points || points.length === 0) {
        return {
            suggestedMin: 10,
            suggestedMax: 30
        };
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
        return {
            minIndex: -1,
            maxIndex: -1
        };
    }

    let minIndex = 0;
    let maxIndex = 0;

    points.forEach((point, index) => {

        if (point.y < points[minIndex].y) {
            minIndex = index;
        }

        if (point.y > points[maxIndex].y) {
            maxIndex = index;
        }
    });

    return {
        minIndex,
        maxIndex
    };
}

/* =========================================================
   MIN / MAX LABEL PLUGIN
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

        /* =============================
           HIGH LABEL
        ============================= */

        ctx.fillStyle = '#ffb199';

        ctx.fillText(
            'H',
            maxPoint.x,
            maxPoint.y - 14
        );

        /* =============================
           LOW LABEL
        ============================= */

        ctx.fillStyle = '#7dd3fc';

        ctx.fillText(
            'L',
            minPoint.x,
            minPoint.y - 14
        );

        ctx.restore();
    }
};

/* =========================================================
   REGISTER PLUGINS
========================================================= */

Chart.register(minMaxLabelsPlugin);

/* =========================================================
   MAIN CHART RENDER
========================================================= */

export function renderWeatherChart(backendData) {

    try {

        /* =================================================
           MAP DATA
        ================================================= */

        const chartPoints = backendData.map(item => ({
            x: new Date(item.hour),
            y: item.hourlyValue
        }));

        /* =================================================
           CHART TIME RANGE
        ================================================= */

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        /* =================================================
           Y SCALE
        ================================================= */

        const yBounds = getDynamicYBounds(chartPoints);

        /* =================================================
           MIN/MAX POINTS
        ================================================= */

        const {
            minIndex,
            maxIndex
        } = getMinMaxPoints(chartPoints);

        /* =================================================
           DESTROY OLD CHART
        ================================================= */

        const ctx = document
            .getElementById('weatherChart')
            .getContext('2d');

        /* =================================================
           THERMAL AREA GRADIENT
        ================================================= */

        const gradientFill = ctx.createLinearGradient(
            0,
            0,
            0,
            350
        );

        gradientFill.addColorStop(
            0,
            'rgba(255, 138, 101, 0.30)'
        );

        gradientFill.addColorStop(
            0.45,
            'rgba(255, 138, 101, 0.08)'
        );

        gradientFill.addColorStop(
            1,
            'rgba(255, 138, 101, 0.00)'
        );

        /* =================================================
           CREATE CHART
        ================================================= */

        weatherChartInstance = new Chart(ctx, {

            type: 'line',

            data: {

                datasets: [{

                    label: 'Temperature',

                    data: chartPoints,

                    borderColor: '#ff8a65',

                    backgroundColor: gradientFill,

                    fill: true,

                    tension: 0.42,

                    borderWidth: 2.8,

                    borderCapStyle: 'round',

                    borderJoinStyle: 'round',

                    /* =====================================
                       POINT STYLING
                    ===================================== */

                    pointRadius: (context) => {

                        const index = context.dataIndex;
                        const lastIndex =
                            chartPoints.length - 1;

                        /* CURRENT TEMP */
                        if (index === lastIndex) return 6;

                        /* MAX TEMP */
                        if (index === maxIndex) return 3;

                        /* MIN TEMP */
                        if (index === minIndex) return 3;

                        return 0;
                    },

                    pointHoverRadius: 6,

                    pointBackgroundColor: (context) => {

                        const index = context.dataIndex;
                        const lastIndex =
                            chartPoints.length - 1;

                        /* CURRENT */
                        if (index === lastIndex) {
                            return '#ffffff';
                        }

                        /* MAX */
                        if (index === maxIndex) {
                            return '#ffb199';
                        }

                        /* MIN */
                        if (index === minIndex) {
                            return '#7dd3fc';
                        }

                        return '#ff8a65';
                    },

                    pointBorderColor: (context) => {

                        const index = context.dataIndex;
                        const lastIndex =
                            chartPoints.length - 1;

                        /* CURRENT */
                        if (index === lastIndex) {
                            return '#ff8a65';
                        }

                        /* MAX */
                        if (index === maxIndex) {
                            return '#ffe5dc';
                        }

                        /* MIN */
                        if (index === minIndex) {
                            return '#dff4ff';
                        }

                        return '#ffd0c2';
                    },

                    pointBorderWidth: (context) => {

                        const index = context.dataIndex;
                        const lastIndex =
                            chartPoints.length - 1;

                        /* CURRENT POINT */
                        if (index === lastIndex) {
                            return 3;
                        }

                        return 2;
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

                    /* =====================================
                       X AXIS
                    ===================================== */

                    x: {

                        type: 'time',

                        time: {

                            unit: 'hour',

                            displayFormats: {
                                hour: 'H'
                            },

                            tooltipFormat: 'HH:mm'
                        },

                        min: startOfDay,

                        max: endOfDay,

                        ticks: {

                            autoSkip: true,

                            maxTicksLimit: 12,

                            color: '#94a3b8',

                            font: {
                                size: 11
                            }
                        },

                        grid: {

                            color:
                                'rgba(255,255,255,0.045)',

                            drawBorder: false
                        },

                        border: {
                            display: false
                        }
                    },

                    /* =====================================
                       Y AXIS
                    ===================================== */

                    y: {

                        suggestedMin:
                            yBounds.suggestedMin,

                        suggestedMax:
                            yBounds.suggestedMax,

                        ticks: {

                            stepSize: 1,

                            callback: (val) =>
                                `${val}°`,

                            color: '#94a3b8',

                            font: {
                                size: 11
                            }
                        },

                        grid: {

                            color:
                                'rgba(255,255,255,0.045)',

                            drawBorder: false
                        },

                        border: {
                            display: false
                        }
                    }
                },

                /* =====================================
                   PLUGINS
                ===================================== */

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

                                if (!items.length) {
                                    return '';
                                }

                                const date =
                                    new Date(
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

                            label: (context) =>
                                `${context.parsed.y.toFixed(1)}°C`
                        }
                    },

                    /* =====================================
                       LABEL PLUGIN OPTIONS
                    ===================================== */

                    minMaxLabels: {

                        minIndex,

                        maxIndex
                    }
                }
            },

            /* =========================================
               LINE GLOW EFFECT
            ========================================= */

            plugins: [{

                id: 'lineGlow',

                beforeDatasetDraw(chart) {

                    const { ctx } = chart;

                    ctx.save();

                    ctx.shadowColor =
                        'rgba(255, 140, 100, 0.30)';

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

        console.error(
            'Error loading chart data:',
            error
        );
    }
}