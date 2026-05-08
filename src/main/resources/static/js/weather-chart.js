let weatherChartInstance = null;

function getDynamicYBounds(points) {
    if (!points || points.length === 0) return { min: 10, max: 30 }; // Default fallbacks
    
    const values = points.map(p => p.y);
    return {
        suggestedMin: Math.min(...values) - 2,
        suggestedMax: Math.max(...values) + 2
    };
}

async function initWeatherChart() {
    try {
        const response = await fetch('/api/weather/chart');
        if (!response.ok) throw new Error('Network response was not ok');

        const backendData = await response.json();

        // 1. Map to Chart.js objects
        const chartPoints = backendData.map(item => ({
            x: new Date(item.hour),
            y: item.hourlyValue
        }));

        // 2. Define Chart Window (00:00 to 23:59)
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date();
        endOfDay.setHours(23, 59, 59, 999);

        // 3. Get Scale Buffer
        const yBounds = getDynamicYBounds(chartPoints);

        const ctx = document.getElementById('weatherChart').getContext('2d');
        if (weatherChartInstance) {
            weatherChartInstance.destroy();
        }

        // 4. Create Instance
        weatherChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Temperature (°C)',
                    data: chartPoints,
                    borderColor: '#4bc0c0',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0, // Clean look for 5-min intervals
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'hour',
                            displayFormats: { hour: 'H' }, // Clean mobile-friendly format
                            tooltipFormat: 'HH:mm'
                        },
                        min: startOfDay,
                        max: endOfDay,
                        ticks: {
                            autoSkip: true,
                            maxTicksLimit: 12,
                            color: '#2c3e50'
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    y: {
                        suggestedMin: yBounds.suggestedMin,
                        suggestedMax: yBounds.suggestedMax,
                        ticks: {
                            stepSize: 1, // Cleaner grid spacing
                            callback: (val) => val + '°'
                        },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    }
                },
                plugins: {
                    legend: { display: false } // Hide if title is already descriptive
                }
            }
        });

    } catch (error) {
        console.error('Error loading chart data:', error);
    }
}

document.addEventListener('DOMContentLoaded', initWeatherChart);