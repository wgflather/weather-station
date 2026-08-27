// chart-labels.js
//
// The H / L / Now markers on the 24-hour chart: text measurement, label
// placement, overlap resolution, and the collision scenarios for when the
// high, the low and "now" land on top of each other.
//
// Owns `minMaxLabelsPlugin` and registers it with Chart.js on import, so
// importing this module for its side effect is deliberate — the chart config
// only refers to the plugin by its id, 'minMaxLabels'.
//
// The plugin reads `chart.$state`, which weather-chart.js stashes on the
// instance each render; resolveCollisionScenario() fills in the `scenario`
// field it dispatches on.

/* =========================================================
   MIN / MAX / NOW LABELS PLUGIN
========================================================= */
const LABEL_PADDING = 2;

// Estimate the on-screen box a label will occupy
export function measureLabel(ctx, text, font) {
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
    wind:        { triple: false, maxAbsorbed: false, minAbsorbed: false },
    uvIndex:     { triple: false, maxAbsorbed: false, minAbsorbed: false },
};

// Decide how today's High/Low pins relate to "Now": 'triple' (H and L both
// collapse onto Now), 'maxAbsorbed' (H collapses onto Now, L stays put),
// 'minAbsorbed' (mirror), or 'none' (render H/L/Now independently, subject
// to the pixel-geometry pass below)
export function resolveCollisionScenario(metric, chartPoints, minIndex, maxIndex,
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
            showNow = true, maxLabelColor, minLabelColor,
        } = pluginOptions;

        chart.$hideMaxPin    = false;
        chart.$hideMinPin    = false;
        chart.$visibleLabels = [];

        const nowEl = meta.data[latestIndex];
        const maxEl = validMinMax ? meta.data[maxIndex] : null;
        const minEl = validMinMax ? meta.data[minIndex] : null;

        const maxIsNow = validMinMax && maxIndex === latestIndex;

        const { ctx, chartArea } = chart;
        const hlFont   = isMobile ? '700 8px Figtree' : '700 13px Figtree';
        const nowFont  = isMobile ? '700 8px Figtree' : '700 12px Figtree';
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
            const lLabel = {
                key: 'min', point: minEl, text: 'L', color: minLabelColor, font: hlFont,
                gap, preferAbove: false, ...measureLabel(ctx, 'L', hlFont),
            };

            placeFixedOffsetLabel(hLabel, chartArea);
            placeLabel(lLabel, chartArea);

            if (showNow) {
                const nowLabel = {
                    key: 'now', point: nowEl, text: 'Now', color: '#ffffff', font: nowFont,
                    gap, preferAbove: false, ...measureLabel(ctx, 'Now', nowFont),
                };
                placeLabel(nowLabel, chartArea);
                resolveLabelOverlaps([nowLabel, lLabel], chartArea);
                visible = [hLabel, nowLabel, lLabel];
            } else {
                visible = [hLabel, lLabel];
            }

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
            const hLabel = {
                key: 'max', point: maxEl, text: 'H', color: maxLabelColor, font: hlFont,
                gap, preferAbove: true, ...measureLabel(ctx, 'H', hlFont),
            };

            placeFixedOffsetLabel(lLabel, chartArea);
            placeLabel(hLabel, chartArea);

            if (showNow) {
                const nowLabel = {
                    key: 'now', point: nowEl, text: 'Now', color: '#ffffff', font: nowFont,
                    gap, preferAbove: true, ...measureLabel(ctx, 'Now', nowFont),
                };
                placeLabel(nowLabel, chartArea);
                resolveLabelOverlaps([nowLabel, hLabel], chartArea);
                visible = [lLabel, nowLabel, hLabel];
            } else {
                visible = [lLabel, hLabel];
            }

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

            if (nowEl && showNow) {
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
