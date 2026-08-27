// chart-metrics.js
//
// Everything about the 24-hour chart that varies per metric: what each one is
// called and how its axis is formatted (METRIC_CONFIG), the value -> colour
// ramps (COLOR_SCALES), and the two canvas gradients built from those ramps.
//
// Pure lookup tables and pure functions — no chart state, no DOM.

/* =========================================================
   PER-METRIC VALUE -> COLOR SCALES
   Drives the value-based gradient line (and area fill) for
   every metric: cold->hot for temperature, dry->humid for
   humidity, low->high for pressure. Stops are in each metric's
   own unit (°C / % / hPa) and interpolated linearly.
========================================================= */
export const COLOR_SCALES = {
    temperature: [
        { stop: -20, r:  59, g: 130, b: 246 },
        { stop:  -5, r: 147, g: 197, b: 253 },
        { stop:   5, r: 224, g: 242, b: 254 },
        { stop:  15, r: 253, g: 230, b: 138 },
        { stop:  25, r: 251, g: 146, b:  60 },
        { stop:  35, r: 239, g:  68, b:  68 },
    ],
    // dry (pale slate) -> humid (deep blue)
    humidity: [
        { stop:  20, r: 226, g: 232, b: 240 },
        { stop:  40, r: 165, g: 243, b: 252 },
        { stop:  60, r:  56, g: 189, b: 248 },
        { stop:  80, r:  14, g: 165, b: 233 },
        { stop: 100, r:  37, g:  99, b: 235 },
    ],
    // low/stormy (indigo) -> normal (slate) -> high/fair (green->amber)
    pressure: [
        { stop:  985, r: 129, g: 140, b: 248 },
        { stop: 1000, r: 148, g: 163, b: 184 },
        { stop: 1013, r: 203, g: 213, b: 225 },
        { stop: 1025, r: 110, g: 231, b: 183 },
        { stop: 1040, r: 251, g: 191, b:  36 },
    ],
    // calm (pale sky) -> light breeze (cyan) -> moderate (teal) -> strong (amber) -> storm (red)
    wind: [
        { stop:  0, r: 224, g: 242, b: 254 },
        { stop:  3, r: 103, g: 232, b: 249 },
        { stop:  8, r:  52, g: 211, b: 153 },
        { stop: 14, r: 251, g: 191, b:  36 },
        { stop: 20, r: 239, g:  68, b:  68 },
    ],
    // safe (green) -> moderate (yellow) -> high (orange) -> very high (red) -> extreme (violet)
    uvIndex: [
        { stop:  0, r: 134, g: 239, b: 172 },
        { stop:  3, r: 253, g: 224, b:  71 },
        { stop:  6, r: 251, g: 146, b:  60 },
        { stop:  8, r: 239, g:  68, b:  68 },
        { stop: 11, r: 167, g: 139, b: 250 },
    ],
};

function scaleToRgb(scale, value) {
    if (value <= scale[0].stop) return { ...scale[0] };
    if (value >= scale[scale.length - 1].stop) return { ...scale[scale.length - 1] };
    for (let i = 0; i < scale.length - 1; i++) {
        const lo = scale[i];
        const hi = scale[i + 1];
        if (value >= lo.stop && value <= hi.stop) {
            const t = (value - lo.stop) / (hi.stop - lo.stop);
            return {
                r: Math.round(lo.r + t * (hi.r - lo.r)),
                g: Math.round(lo.g + t * (hi.g - lo.g)),
                b: Math.round(lo.b + t * (hi.b - lo.b)),
            };
        }
    }
    return { r: 255, g: 255, b: 255 };
}

export function scaleToRgbString(scale, value, alpha = 1) {
    const { r, g, b } = scaleToRgb(scale, value);
    return alpha < 1 ? `rgba(${r},${g},${b},${alpha})` : `rgb(${r},${g},${b})`;
}

/* =========================================================
   METRIC CONFIG
========================================================= */
export const METRIC_CONFIG = {
    temperature: {
        label:         'Temperature',
        tooltipSuffix: '°C',
        yAxisSuffix:   '°',
        yStep:         2,
        lineColor:     null,
        shadowColor:   'rgba(255, 120, 90, 0.25)',
        fillTop:       null,
        fillMid:       null,
        maxNodeColor:  '#ef4444',
        minNodeColor:  '#3b82f6',
        innerBorder:   '#ffffff',
        closeThreshold: 0.3,
    },
    pressure: {
        label:         'Pressure',
        tooltipSuffix: ' hPa',
        yAxisSuffix:   '',
        yStep:         10,
        lineColor:     '#cbd5e1',
        shadowColor:   'rgba(203, 213, 225, 0.20)',
        fillTop:       'rgba(203, 213, 225, 0.22)',
        fillMid:       'rgba(203, 213, 225, 0.05)',
        maxNodeColor:  '#e2e8f0',
        minNodeColor:  '#94a3b8',
        innerBorder:   '#f8fafc',
        closeThreshold: 0.5,
    },
    humidity: {
        label:         'Humidity',
        tooltipSuffix: '%',
        yAxisSuffix:   '%',
        yStep:         10,
        lineColor:     '#38bdf8',
        shadowColor:   'rgba(56, 189, 248, 0.25)',
        fillTop:       'rgba(56, 189, 248, 0.22)',
        fillMid:       'rgba(56, 189, 248, 0.05)',
        maxNodeColor:  '#7dd3fc',
        minNodeColor:  '#0ea5e9',
        innerBorder:   '#e0f2fe',
        closeThreshold: 2,
    },
    wind: {
        label:          'Wind',
        tooltipSuffix:  ' m/s',
        yAxisSuffix:    '',
        yStep:          2,
        lineColor:      null,
        shadowColor:    'rgba(103, 232, 249, 0.25)',
        fillTop:        null,
        fillMid:        null,
        maxNodeColor:   '#ef4444',
        minNodeColor:   '#a5f3fc',
        innerBorder:    '#cffafe',
        closeThreshold: 0.5,
    },
    uvIndex: {
        label:          'UV Index',
        tooltipSuffix:  '',
        yAxisSuffix:    '',
        yStep:          1,
        lineColor:      null,
        shadowColor:    'rgba(251, 191, 36, 0.25)',
        fillTop:        null,
        fillMid:        null,
        maxNodeColor:   '#fb923c',
        minNodeColor:   '#86efac',
        innerBorder:    '#fef3c7',
        closeThreshold: 0.2,
    },
};


/* =========================================================
   VALUE-BASED LINE GRADIENT
   Maps the visible y-axis range onto the metric's color scale,
   so the line color tracks the reading's value at every height.
========================================================= */
export function createDynamicGradient(ctx, chartArea, yAxis, scale) {
    const grad = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    const maxV = yAxis.max;
    const minV = yAxis.min;
    for (let i = 0; i <= 10; i++) {
        const pos   = i / 10;
        const value = maxV - (pos * (maxV - minV));
        grad.addColorStop(pos, scaleToRgbString(scale, value));
    }
    return grad;
}

/* =========================================================
   AREA FILL GRADIENT (follows the live canvas height)
========================================================= */
export function buildAreaFill(ctx, chartArea, state) {
    const grad = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);

    if (state.config.fillTop == null) {
        // Value-based fill: derive the colour from the dataset's average value so
        // the area tint matches the dynamic gradient line (temperature, wind, uvIndex).
        const real   = state.chartPoints.filter(p => p.y != null);
        const midStop = (state.scale[0].stop + state.scale[state.scale.length - 1].stop) / 2;
        const avgVal = real.length
            ? real.reduce((s, p) => s + p.y, 0) / real.length
            : midStop;
        grad.addColorStop(0,   scaleToRgbString(state.scale, avgVal, 0.28));
        grad.addColorStop(0.5, scaleToRgbString(state.scale, avgVal, 0.07));
        grad.addColorStop(1,   'rgba(255,255,255,0)');
    } else {
        grad.addColorStop(0,    state.config.fillTop);
        grad.addColorStop(0.45, state.config.fillMid);
        grad.addColorStop(1,    'rgba(255,255,255,0)');
    }

    return grad;
}

