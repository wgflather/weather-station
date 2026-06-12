let weatherChartInstance = null;

/* =========================================================
   PER-METRIC VALUE -> COLOR SCALES
   Drives the value-based gradient line (and area fill) for
   every metric: cold->hot for temperature, dry->humid for
   humidity, low->high for pressure. Stops are in each metric's
   own unit (°C / % / hPa) and interpolated linearly.
========================================================= */
const COLOR_SCALES = {
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

function scaleToRgbString(scale, value, alpha = 1) {
    const { r, g, b } = scaleToRgb(scale, value);
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
        closeThreshold: 0.3,
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
        closeThreshold: 0.5,
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
        closeThreshold: 2,
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
   Covers gaps between readings, plus the "no data yet" edges
   between the start of the day / first reading and the last
   reading / now (now -> end of day is handled by the future overlay).
========================================================= */
function extractGapSegments(rawPoints, resolutionMinutes, startRange, now) {
    if (!rawPoints.length) return [];

    const gapThreshold = resolutionMinutes * 60 * 1000 * 2.5;
    const segments     = [];

    // Leading gap: start of day -> first reading
    const first = rawPoints[0];
    if (first.x.getTime() - startRange.getTime() > gapThreshold) {
        segments.push({ x: startRange, y: first.y });
        segments.push({ x: first.x, y: first.y });
        segments.push({ x: new Date(first.x.getTime() + 1), y: null });
    }

    // Internal gaps between consecutive readings
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

    // Trailing gap: last reading -> now
    const last = rawPoints[rawPoints.length - 1];
    if (now.getTime() - last.x.getTime() > gapThreshold) {
        segments.push({ x: last.x, y: last.y });
        segments.push({ x: now, y: last.y });
        segments.push({ x: new Date(now.getTime() + 1), y: null });
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
    if (!real.length) return { minIndex: -1, maxIndex: -1 };

    let minReal = 0;
    let maxReal = 0;

    real.forEach((pt, i) => {
        if (pt.y < real[minReal].y) minReal = i;
        if (pt.y > real[maxReal].y) maxReal = i;
    });

    // map back to full array indices
    const minTime = real[minReal].x.getTime();
    const maxTime = real[maxReal].x.getTime();
    const fullMin = points.findIndex(p => p.x.getTime() === minTime && p.y != null);
    const fullMax = points.findIndex(p => p.x.getTime() === maxTime && p.y != null);

    return { minIndex: fullMin, maxIndex: fullMax };
}

function hasEnoughDataDuration(backendData) {
    if (!backendData || backendData.length < 2) return false;
    const first = new Date(backendData[0].hour).getTime();
    const last  = new Date(backendData[backendData.length - 1].hour).getTime();
    return ((last - first) / 60000) >= 90;
}

/* =========================================================
   VALUE-BASED LINE GRADIENT
   Maps the visible y-axis range onto the metric's color scale,
   so the line color tracks the reading's value at every height.
========================================================= */
function createDynamicGradient(ctx, chartArea, yAxis, scale) {
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
function buildAreaFill(ctx, chartArea, state) {
    const grad = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);

    if (state.metric === 'temperature') {
        const real    = state.chartPoints.filter(p => p.y != null);
        const avgTemp = real.length
            ? real.reduce((s, p) => s + p.y, 0) / real.length
            : 15;
        grad.addColorStop(0,   scaleToRgbString(state.scale, avgTemp, 0.28));
        grad.addColorStop(0.5, scaleToRgbString(state.scale, avgTemp, 0.07));
        grad.addColorStop(1,   'rgba(255,255,255,0)');
    } else {
        grad.addColorStop(0,    state.config.fillTop);
        grad.addColorStop(0.45, state.config.fillMid);
        grad.addColorStop(1,    'rgba(255,255,255,0)');
    }

    return grad;
}

/* =========================================================
   MIN / MAX / NOW LABELS PLUGIN
========================================================= */
const LABEL_PADDING = 2;

// Estimate the on-screen box a label will occupy
function measureLabel(ctx, text, font) {
    ctx.font = font;
    const m       = ctx.measureText(text);
    const ascent  = m.actualBoundingBoxAscent  ?? parseInt(font, 10) * 0.7;
    const descent = m.actualBoundingBoxDescent ?? parseInt(font, 10) * 0.3;
    return {
        halfW: m.width / 2 + LABEL_PADDING,
        halfH: (ascent + descent) / 2 + LABEL_PADDING,
    };
}

// Position a label above/below its point, flipping side (and clamping)
// so it never gets clipped by the chart area's edges/borders
function placeLabel(label, chartArea) {
    const { halfW, halfH } = label;

    let y = label.preferAbove ? label.point.y - label.gap : label.point.y + label.gap;

    if (label.preferAbove && y - halfH < chartArea.top) {
        y = label.point.y + label.gap;
    } else if (!label.preferAbove && y + halfH > chartArea.bottom) {
        y = label.point.y - label.gap;
    }

    label.y = Math.min(Math.max(y, chartArea.top + halfH), chartArea.bottom - halfH);
    label.x = Math.min(Math.max(label.point.x, chartArea.left + halfW), chartArea.right - halfW);
}

// Like placeLabel, but never flips sides — used for labels that must stay
// pinned to a fixed offset from their anchor (H/L absorbed into "Now")
function placeFixedOffsetLabel(label, chartArea) {
    const { halfW, halfH } = label;
    const y = label.preferAbove ? label.point.y - label.gap : label.point.y + label.gap;
    label.y = Math.min(Math.max(y, chartArea.top + halfH), chartArea.bottom - halfH);
    label.x = Math.min(Math.max(label.point.x, chartArea.left + halfW), chartArea.right - halfW);
}

// Push apart any labels whose boxes overlap, keeping them inside chartArea
function resolveLabelOverlaps(labels, chartArea) {
    for (let pass = 0; pass < 4; pass++) {
        let moved = false;

        for (let i = 0; i < labels.length; i++) {
            for (let j = i + 1; j < labels.length; j++) {
                const a = labels[i];
                const b = labels[j];

                const xOverlap = (a.halfW + b.halfW) - Math.abs(a.x - b.x);
                const yOverlap = (a.halfH + b.halfH) - Math.abs(a.y - b.y);
                if (xOverlap <= 0 || yOverlap <= 0) continue;

                const push = yOverlap / 2 + 1;
                if (a.y <= b.y) {
                    a.y -= push;
                    b.y += push;
                } else {
                    a.y += push;
                    b.y -= push;
                }

                a.y = Math.min(Math.max(a.y, chartArea.top + a.halfH), chartArea.bottom - a.halfH);
                b.y = Math.min(Math.max(b.y, chartArea.top + b.halfH), chartArea.bottom - b.halfH);
                moved = true;
            }
        }

        if (!moved) break;
    }
}

// True if any two labels still collide after overlap resolution —
// the chart is too small/cramped to place them legibly
function hasResidualOverlap(labels) {
    for (let i = 0; i < labels.length; i++) {
        for (let j = i + 1; j < labels.length; j++) {
            const a = labels[i];
            const b = labels[j];

            const xOverlap = (a.halfW + b.halfW) - Math.abs(a.x - b.x);
            const yOverlap = (a.halfH + b.halfH) - Math.abs(a.y - b.y);
            if (xOverlap > 0 && yOverlap > 0) return true;
        }
    }
    return false;
}

// Minimum on-screen gap (px) between two pins before they're considered "overlapping"
const PIN_GAP = 2;

function pinsOverlap(a, b) {
    if (!a || !b) return false;
    const ra = a.options?.radius ?? 0;
    const rb = b.options?.radius ?? 0;
    return Math.hypot(a.x - b.x, a.y - b.y) < ra + rb + PIN_GAP;
}

/* =========================================================
   CONTEXT-AWARE H/L/NOW COLLISION RESOLUTION
========================================================= */
// "1-2 hours" from the spec, used as the triple-collision window
const TRIPLE_COLLISION_WINDOW_MINUTES = 90;

// Hysteresis memory per metric — persists across re-renders (the module
// stays loaded across the 20s polling cycle) so layouts don't flicker
// as new data streams in near a threshold boundary
const COLLISION_STATE = {
    temperature: { triple: false, maxAbsorbed: false, minAbsorbed: false },
    pressure:    { triple: false, maxAbsorbed: false, minAbsorbed: false },
    humidity:    { triple: false, maxAbsorbed: false, minAbsorbed: false },
};

// Decide how today's High/Low pins relate to "Now": 'triple' (H and L both
// collapse onto Now), 'maxAbsorbed' (H collapses onto Now, L stays put),
// 'minAbsorbed' (mirror), or 'none' (render H/L/Now independently, subject
// to the pixel-geometry pass below)
function resolveCollisionScenario(metric, chartPoints, minIndex, maxIndex,
                                   latestIndex, validMinMax, resolutionMinutes, config) {
    const state = COLLISION_STATE[metric];
    if (!validMinMax) {
        state.triple = state.maxAbsorbed = state.minAbsorbed = false;
        return 'none';
    }

    const nowValue  = chartPoints[latestIndex].y;
    const maxValue  = chartPoints[maxIndex].y;
    const minValue  = chartPoints[minIndex].y;
    const threshold = config.closeThreshold;

    const deltaMax = latestIndex - maxIndex; // always >= 0
    const deltaMin = latestIndex - minIndex;

    // --- Scenario 1: triple collision (own window + own hysteresis) ---
    const tripleWindow = Math.max(2, Math.round(TRIPLE_COLLISION_WINDOW_MINUTES / resolutionMinutes));
    const valuesClose  = Math.abs(maxValue - minValue) <= threshold;
    const tripleEntry  = deltaMax <= tripleWindow && deltaMin <= tripleWindow && valuesClose;
    const tripleExit   = deltaMax > tripleWindow + 1 || deltaMin > tripleWindow + 1 || !valuesClose;
    state.triple = state.triple ? !tripleExit : tripleEntry;

    if (state.triple) {
        state.maxAbsorbed = false;
        state.minAbsorbed = false;
        return 'triple';
    }

    // --- Scenarios 2/3: per-extreme "adjacent to Now" absorption ---
    const maxDiff = Math.abs(maxValue - nowValue);
    const minDiff = Math.abs(minValue - nowValue);

    const maxEntry = deltaMax <= 1 && maxDiff <= threshold;
    const maxExit  = deltaMax >= 2 || maxDiff > threshold;
    state.maxAbsorbed = state.maxAbsorbed ? !maxExit : maxEntry;

    const minEntry = deltaMin <= 1 && minDiff <= threshold;
    const minExit  = deltaMin >= 2 || minDiff > threshold;
    state.minAbsorbed = state.minAbsorbed ? !minExit : minEntry;

    if (state.maxAbsorbed && state.minAbsorbed) return 'triple'; // degenerate both-absorbed case, same rendering
    if (state.maxAbsorbed) return 'maxAbsorbed';
    if (state.minAbsorbed) return 'minAbsorbed';
    return 'none';
}

const minMaxLabelsPlugin = {
    id: 'minMaxLabels',

    // Decide which of H / L / Now get a pin + label this frame. `scenario`
    // (from resolveCollisionScenario) dispatches to a dedicated layout for
    // H/L positions that have collapsed onto "Now"; the 'none' fallback
    // uses pixel-geometry overlap detection — "Now" always wins, H and L
    // are dropped (pin and label both) in that order until nothing overlaps.
    beforeDatasetsDraw(chart, args, pluginOptions) {
        const meta = chart.getDatasetMeta(0);
        if (!meta.data || !meta.data.length) return;

        const {
            minIndex, maxIndex, latestIndex, validMinMax, scenario, isMobile,
            maxLabelColor, minLabelColor,
        } = pluginOptions;

        chart.$hideMaxPin    = false;
        chart.$hideMinPin    = false;
        chart.$visibleLabels = [];

        const nowEl = meta.data[latestIndex];
        const maxEl = validMinMax ? meta.data[maxIndex] : null;
        const minEl = validMinMax ? meta.data[minIndex] : null;

        const maxIsNow = validMinMax && maxIndex === latestIndex;

        const { ctx, chartArea } = chart;
        const hlFont   = isMobile ? '700 8px Nunito' : '700 13px Nunito';
        const nowFont  = isMobile ? '700 8px Nunito' : '700 12px Nunito';
        const gap      = isMobile ? 9 : 16;
        const fixedGap = isMobile ? 14 : 16;

        let visible;

        if (scenario === 'triple') {
            // H and L both collapse onto "Now" — hide their own dots and
            // flank the Now pin with fixed-offset H/L labels
            if (maxEl !== nowEl) {
                maxEl.options.radius      = 0;
                maxEl.options.borderWidth = 0;
                chart.$hideMaxPin = true;
            }
            if (minEl !== nowEl) {
                minEl.options.radius      = 0;
                minEl.options.borderWidth = 0;
                chart.$hideMinPin = true;
            }

            const hLabel = {
                key: 'max', point: nowEl, text: 'H', color: maxLabelColor, font: hlFont,
                gap: fixedGap, preferAbove: true, ...measureLabel(ctx, 'H', hlFont),
            };
            const lLabel = {
                key: 'min', point: nowEl, text: 'L', color: minLabelColor, font: hlFont,
                gap: fixedGap, preferAbove: false, ...measureLabel(ctx, 'L', hlFont),
            };
            placeFixedOffsetLabel(hLabel, chartArea);
            placeFixedOffsetLabel(lLabel, chartArea);
            visible = [hLabel, lLabel];

        } else if (scenario === 'maxAbsorbed') {
            // H collapses onto "Now" — ring Now in H's color, pin "H" 14px
            // above it, and render "L" + "Now" normally
            if (maxEl !== nowEl) {
                maxEl.options.radius      = 0;
                maxEl.options.borderWidth = 0;
                chart.$hideMaxPin = true;
            }
            nowEl.options.borderColor = maxLabelColor;

            const hLabel = {
                key: 'max', point: nowEl, text: 'H', color: maxLabelColor, font: hlFont,
                gap: fixedGap, preferAbove: true, ...measureLabel(ctx, 'H', hlFont),
            };
            const nowLabel = {
                key: 'now', point: nowEl, text: 'Now', color: '#ffffff', font: nowFont,
                gap, preferAbove: false, ...measureLabel(ctx, 'Now', nowFont),
            };
            const lLabel = {
                key: 'min', point: minEl, text: 'L', color: minLabelColor, font: hlFont,
                gap, preferAbove: false, ...measureLabel(ctx, 'L', hlFont),
            };

            placeFixedOffsetLabel(hLabel, chartArea);
            placeLabel(nowLabel, chartArea);
            placeLabel(lLabel, chartArea);
            resolveLabelOverlaps([nowLabel, lLabel], chartArea);

            visible = [hLabel, nowLabel, lLabel];

        } else if (scenario === 'minAbsorbed') {
            // L collapses onto "Now" — ring Now in L's color, pin "L" 14px
            // below it, and render "H" + "Now" normally
            if (minEl !== nowEl) {
                minEl.options.radius      = 0;
                minEl.options.borderWidth = 0;
                chart.$hideMinPin = true;
            }
            nowEl.options.borderColor = minLabelColor;

            const lLabel = {
                key: 'min', point: nowEl, text: 'L', color: minLabelColor, font: hlFont,
                gap: fixedGap, preferAbove: false, ...measureLabel(ctx, 'L', hlFont),
            };
            const nowLabel = {
                key: 'now', point: nowEl, text: 'Now', color: '#ffffff', font: nowFont,
                gap, preferAbove: true, ...measureLabel(ctx, 'Now', nowFont),
            };
            const hLabel = {
                key: 'max', point: maxEl, text: 'H', color: maxLabelColor, font: hlFont,
                gap, preferAbove: true, ...measureLabel(ctx, 'H', hlFont),
            };

            placeFixedOffsetLabel(lLabel, chartArea);
            placeLabel(nowLabel, chartArea);
            placeLabel(hLabel, chartArea);
            resolveLabelOverlaps([nowLabel, hLabel], chartArea);

            visible = [lLabel, nowLabel, hLabel];

        } else {
            // ── 'none': pixel-geometry fallback ──────────────────────
            // Pin-overlap pass: drop a colliding H/L pin entirely
            if (validMinMax) {
                const minIsNow      = minIndex === latestIndex;
                const maxNearNow    = !maxIsNow && pinsOverlap(maxEl, nowEl);
                const minNearNow    = !minIsNow && pinsOverlap(minEl, nowEl);
                const maxMinOverlap = pinsOverlap(maxEl, minEl);

                chart.$hideMaxPin = maxMinOverlap || maxNearNow;
                chart.$hideMinPin = maxMinOverlap || minNearNow;

                if (chart.$hideMaxPin && maxEl !== nowEl) {
                    maxEl.options.radius      = 0;
                    maxEl.options.borderWidth = 0;
                }
                if (chart.$hideMinPin && minEl !== nowEl) {
                    minEl.options.radius      = 0;
                    minEl.options.borderWidth = 0;
                }

                // A distinct H/L pin got folded into "Now" because it sits right
                // on top of it — ring "Now" with that color so the overlap isn't
                // lost entirely (skip if Now is already H or L itself, or if both
                // H and L are crowding Now and it'd be ambiguous which to show)
                if (!maxIsNow && !minIsNow) {
                    if (maxNearNow && !minNearNow) {
                        nowEl.options.borderColor = maxLabelColor;
                    } else if (minNearNow && !maxNearNow) {
                        nowEl.options.borderColor = minLabelColor;
                    }
                }
            }

            // Label layout pass: place H/L/Now, then drop H, then L (never
            // "Now") until no two labels overlap
            const candidates = [];

            if (validMinMax && !chart.$hideMaxPin) {
                candidates.push({
                    key: 'max', point: maxEl, text: 'H', color: maxLabelColor, font: hlFont,
                    gap, preferAbove: true,
                    ...measureLabel(ctx, 'H', hlFont),
                });
            }

            if (validMinMax && !chart.$hideMinPin) {
                candidates.push({
                    key: 'min', point: minEl, text: 'L', color: minLabelColor, font: hlFont,
                    gap, preferAbove: false,
                    ...measureLabel(ctx, 'L', hlFont),
                });
            }

            if (nowEl) {
                // When "Now" lands on the same point as H, put "Now" on the
                // opposite side so both labels sit cleanly above/below the pin
                candidates.push({
                    key: 'now', point: nowEl, text: 'Now', color: '#ffffff', font: nowFont,
                    gap, preferAbove: !maxIsNow,
                    ...measureLabel(ctx, 'Now', nowFont),
                });
            }

            candidates.forEach(label => placeLabel(label, chartArea));
            resolveLabelOverlaps(candidates, chartArea);

            visible = candidates;
            if (hasResidualOverlap(visible)) {
                for (const key of ['max', 'min']) {
                    if (!visible.some(l => l.key === key)) continue;
                    visible = visible.filter(l => l.key !== key);
                    visible.forEach(l => placeLabel(l, chartArea));
                    resolveLabelOverlaps(visible, chartArea);
                    if (!hasResidualOverlap(visible)) break;
                }
            }

            // Hide the pin for any H/L whose label didn't make the cut
            if (validMinMax) {
                if (maxEl !== nowEl && !chart.$hideMaxPin && !visible.some(l => l.key === 'max')) {
                    maxEl.options.radius      = 0;
                    maxEl.options.borderWidth = 0;
                    chart.$hideMaxPin = true;
                }
                if (minEl !== nowEl && !chart.$hideMinPin && !visible.some(l => l.key === 'min')) {
                    minEl.options.radius      = 0;
                    minEl.options.borderWidth = 0;
                    chart.$hideMinPin = true;
                }
            }
        }

        chart.$visibleLabels = visible;
    },

    afterDatasetsDraw(chart) {
        const labels = chart.$visibleLabels;
        if (!labels || !labels.length) return;

        const { ctx } = chart;
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        labels.forEach(label => {
            ctx.font      = label.font;
            ctx.fillStyle = label.color;
            ctx.fillText(label.text, label.x, label.y);
        });
        ctx.restore();
    }
};

Chart.register(minMaxLabelsPlugin);

/* =========================================================
   EXTERNAL HTML TOOLTIP
   Rendered outside the canvas so it can flip above/below the
   chart line based on how much room is left to the chart's
   top/bottom edge (the built-in canvas tooltip only flips
   within a few pixels of the *canvas* edge, not the line).
========================================================= */
const TOOLTIP_GAP = 10;

function getTooltipEl() {
    let el = document.getElementById('weather-chart-tooltip');
    if (!el) {
        el = document.createElement('div');
        el.id = 'weather-chart-tooltip';
        el.className = 'chartjs-tooltip';
        document.body.appendChild(el);
    }
    return el;
}

function externalTooltipHandler(context) {
    const { chart, tooltip } = context;
    const el = getTooltipEl();

    if (tooltip.opacity === 0) {
        el.style.opacity = '0';
        return;
    }

    if (tooltip.body) {
        let html = '';
        (tooltip.title || []).forEach(line => {
            html += `<div class="chartjs-tooltip-title">${line}</div>`;
        });
        tooltip.body.forEach((bodyItem, i) => {
            const color = tooltip.labelTextColors?.[i] ?? '#e2e8f0';
            bodyItem.lines.forEach(line => {
                html += `<div class="chartjs-tooltip-body" style="color:${color}">${line}</div>`;
            });
        });
        el.innerHTML = html;
    }

    const canvasRect = chart.canvas.getBoundingClientRect();
    const { chartArea } = chart;

    el.style.opacity = '1';
    const elRect = el.getBoundingClientRect();

    const caretX     = canvasRect.left + tooltip.caretX;
    const caretY     = canvasRect.top  + tooltip.caretY;
    const spaceAbove = tooltip.caretY - chartArea.top;

    // Default to above the point; flip below only when there isn't enough
    // room above (i.e. the point sits close to the chart's top edge)
    const top = (spaceAbove >= elRect.height + TOOLTIP_GAP)
        ? caretY - elRect.height - TOOLTIP_GAP
        : caretY + TOOLTIP_GAP;

    const minLeft = canvasRect.left + chartArea.left;
    const maxLeft = canvasRect.left + chartArea.right - elRect.width;
    const left    = Math.min(Math.max(caretX - elRect.width / 2, minLeft), maxLeft);

    el.style.top  = `${top}px`;
    el.style.left = `${left}px`;
}

/* =========================================================
   CHART STATE
   Recomputed on every render and stashed on the chart instance
   (chart.$state) so dataset callbacks + plugins always read the
   latest analytics — letting us update in place instead of
   destroying/recreating the chart each poll cycle.
========================================================= */
function computeChartState(backendData, metric, resolutionMinutes) {
    const config   = METRIC_CONFIG[metric] ?? METRIC_CONFIG.temperature;
    const scale    = COLOR_SCALES[metric] ?? COLOR_SCALES.temperature;
    const isMobile = window.innerWidth <= 480;

    // ── Time range ──────────────────────────────────────────
    const today      = new Date();
    const startRange = new Date(today); startRange.setHours(0, 0, 0, 0);
    const endRange   = new Date(today); endRange.setHours(23, 59, 59, 999);

    // ── Build point arrays ──────────────────────────────────
    const rawPoints = (backendData || []).map(item => ({
        x: new Date(item.hour),
        y: item.hourlyValue,
    }));

    const chartPoints = insertGapNulls(rawPoints, resolutionMinutes);
    const gapPoints   = extractGapSegments(rawPoints, resolutionMinutes, startRange, today);

    // ── Analytics ───────────────────────────────────────────
    const yBounds                = getDynamicYBounds(chartPoints, metric);
    const { minIndex, maxIndex } = getMinMaxPoints(chartPoints);
    const showMinMax             = hasEnoughDataDuration(backendData);
    const validMinMax            = showMinMax
        && minIndex !== -1 && maxIndex !== -1
        && minIndex !== maxIndex;

    // Last non-null point index for "Now" marker + future overlay
    let latestIndex = chartPoints.length - 1;
    while (latestIndex > 0 && chartPoints[latestIndex]?.y == null) latestIndex--;

    const scenario = resolveCollisionScenario(
        metric, chartPoints, minIndex, maxIndex, latestIndex,
        validMinMax, resolutionMinutes, config
    );

    return {
        metric, resolutionMinutes, config, scale, isMobile,
        today, startRange, endRange,
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
                        unit:           'hour',
                        displayFormats: { hour: 'H' },
                        tooltipFormat:  'HH:mm',
                    },
                    min:    state.startRange,
                    max:    state.endRange,
                    ticks:  { stepSize: 3, color: '#94a3b8', font: { size: state.isMobile ? 9 : 11 } },
                    grid:   { color: 'rgba(255,255,255,0.045)', drawBorder: false },
                    border: { display: false },
                },
                y: {
                    suggestedMin: state.yBounds.suggestedMin,
                    suggestedMax: state.yBounds.suggestedMax,
                    ticks: {
                        stepSize: state.config.yStep,
                        callback: (val) => `${val}${state.config.yAxisSuffix}`,
                        color:    '#94a3b8',
                        font:     { size: state.isMobile ? 9 : 11 },
                    },
                    grid:   { color: 'rgba(255,255,255,0.045)', drawBorder: false },
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
                    if (!st.chartPoints.length) return;
                    const { ctx, chartArea, scales } = chart;
                    const lastReal = st.chartPoints[st.latestIndex];
                    if (!lastReal) return;

                    // Start the "future" shading at now — any gap between
                    // the last reading and now is rendered as a missing-data
                    // bridge instead (see extractGapSegments)
                    const anchor       = Math.max(st.today.getTime(), lastReal.x.getTime());
                    const latestX      = scales.x.getPixelForValue(new Date(anchor));
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
                    const font = chart.$state.isMobile ? '500 9px Nunito' : '500 10px Nunito';

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
export function renderWeatherChart(backendData, metric = 'temperature', resolutionMinutes = 10) {
    try {
        const canvasElement = document.getElementById('weatherChart');
        if (!canvasElement) {
            console.error("Canvas 'weatherChart' not found.");
            return;
        }

        const state = computeChartState(backendData, metric, resolutionMinutes);

        const canReuse = weatherChartInstance
            && weatherChartInstance.$metric === metric
            && weatherChartInstance.$resolution === resolutionMinutes;

        if (canReuse) {
            updateChart(weatherChartInstance, state);
        } else {
            if (weatherChartInstance !== null) {
                weatherChartInstance.destroy();
                weatherChartInstance = null;
            }
            weatherChartInstance = createChart(canvasElement, state);
        }
    } catch (error) {
        console.error('Error rendering weather chart:', error);
    }
}