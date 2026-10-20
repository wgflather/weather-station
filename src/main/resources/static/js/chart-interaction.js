// chart-interaction.js
//
// How the 24-hour chart's tooltip behaves: Chart.js's external tooltip
// handler, where the box is placed, and the touch handling that keeps it from
// re-appearing after a finger lifts.
//
// The tooltip element itself is shared with the history modal's daily chart
// and lives in chart-tooltip.js; this module only decides what goes in it and
// where it sits.

import { getTooltipEl, setTooltipContent, hideTooltip } from './chart-tooltip.js';
import { uiZoom } from './ui-zoom.js';

/* =========================================================
   POINTER POSITION UNDER BODY ZOOM
   Chart.js turns a pointer event into chart coordinates from its offset
   into the canvas, which is in viewport px — and then uses it as chart CSS
   px. Under body zoom (ui-zoom.js) the two differ, so the hovered point
   drifted right with distance from the left edge: at 1.1, point 50 hovered
   as 56. Registered globally, so both the 24-hour chart and the history
   chart get it; the in-area flag is recomputed from the corrected position.
========================================================= */
Chart.register({
    id: 'uiZoomEvents',
    beforeEvent(chart, args) {
        const z = uiZoom();
        if (z === 1) return;
        const e = args.event;
        if (e.x == null || e.y == null) return;
        e.x /= z;
        e.y /= z;
        const a = chart.chartArea;
        if (a) args.inChartArea = e.x >= a.left && e.x <= a.right && e.y >= a.top && e.y <= a.bottom;
    },
});

/* =========================================================
   WHICH ITEM THE POINTER IS ON
   The 24-hour chart has two datasets that do not share indices: the
   readings, and the dashed gap bridges (three points per gap — start, end,
   null separator). Chart.js's 'index' mode found the nearest item and then
   took the *same index* from every dataset, so hovering the end of a gap
   (gap point 1) also selected reading 1 — 00:10 — highlighting a point at
   the far left and putting its value in the "Missing data" tooltip.
   Here a pointer inside a gap's span gets that gap, anywhere else the
   reading nearest in x; never both.
========================================================= */
Chart.Interaction.modes.readingOrGap = function (chart, e) {
    const x = e.x;
    const readings = chart.getDatasetMeta(0);
    const gaps     = chart.getDatasetMeta(1);
    const gapData  = chart.data.datasets[1]?.data ?? [];

    // A span is two consecutive non-null gap points; the nulls between
    // segments keep one gap's end from pairing with the next one's start.
    for (let i = 0; i < gapData.length - 1; i++) {
        if (gapData[i]?.y == null || gapData[i + 1]?.y == null) continue;
        const x0 = gaps.data[i].x;
        const x1 = gaps.data[i + 1].x;
        if (x > x0 && x < x1) {
            const index = x - x0 < x1 - x ? i : i + 1;
            return [{ element: gaps.data[index], datasetIndex: 1, index }];
        }
    }

    const data = chart.data.datasets[0].data;
    let best = -1;
    let bestDist = Infinity;
    readings.data.forEach((el, i) => {
        if (data[i]?.y == null) return;
        const d = Math.abs(el.x - x);
        if (d < bestDist) { bestDist = d; best = i; }
    });
    return best === -1 ? [] : [{ element: readings.data[best], datasetIndex: 0, index: best }];
};

/* =========================================================
   EXTERNAL HTML TOOLTIP
   Rendered outside the canvas. With a mouse it floats just above
   the hovered point (flipping below near the top edge). On touch
   it pins to the top edge of the plot area instead — so a finger
   resting on the line never covers the reading — and is dismissed
   the moment the finger lifts (Chart fires no "mouse-out" for
   touch, so without this a position:fixed tooltip would linger and
   appear to follow the page as you scroll away).
========================================================= */
const TOOLTIP_GAP = 10;

// Whether the in-flight pointer gesture is touch (vs mouse/pen).
let lastInteractionWasTouch = false;

// Set for a short window after a finger lifts. While true the handler refuses
// to paint, which defeats the two ways the tooltip re-appears after a lift:
// Chart's deferred next-frame render of the last touchmove, and the synthetic
// mouse events the browser emits after touchend. Cleared on the next touch.
let tooltipSuppressed = false;
let suppressTimer     = null;

// Hide the tooltip and clear Chart's active/hover state.
function dismissTooltip(chart) {
    hideTooltip();
    if (!chart) return;
    try {
        chart.setActiveElements([]);
        if (chart.tooltip) chart.tooltip.setActiveElements([], { x: 0, y: 0 });
        // Null the cached last-event so Chart.js treats the next touch as a
        // genuinely new interaction — otherwise re-tapping the same point is
        // ignored because Chart.js sees no positional change.
        chart._lastEvent = null;
        chart.update('none');
    } catch (_) { /* chart may be mid-teardown */ }
}

// Bound once per canvas (the <canvas> is reused across chart rebuilds).
export function installPointerHandlers(canvas) {
    if (canvas.dataset.tooltipPointerBound) return;
    canvas.dataset.tooltipPointerBound = '1';

    // Pointer-type detection keyed off real touch events (Chart.js itself
    // drives off touchstart/touchmove, so these always fire). A real mouse
    // move flips back to mouse mode — safe because the touchend handler below
    // preventDefault()s the synthetic mouse events that would otherwise fire
    // after a finger lift.
    const beginTouch = () => {
        lastInteractionWasTouch = true;
        tooltipSuppressed = false;
        if (suppressTimer) { clearTimeout(suppressTimer); suppressTimer = null; }
    };
    canvas.addEventListener('touchstart', beginTouch, { passive: true });
    canvas.addEventListener('touchmove',  beginTouch, { passive: true });
    canvas.addEventListener('mousemove',  () => { lastInteractionWasTouch = false; });

    // The reliable touch-end signal. preventDefault() suppresses the trailing
    // synthetic mouse events; the suppression window blocks any re-show (incl.
    // Chart's deferred next-frame paint) until the next deliberate touch.
    const endTouch = (e) => {
        if (e.cancelable) e.preventDefault();
        tooltipSuppressed = true;
        // Use Chart.getChart() rather than chartInstances so this handler
        // correctly dismisses whichever chart is currently on the canvas —
        // including daily charts that are not tracked in chartInstances.
        dismissTooltip(Chart.getChart(canvas));
        if (suppressTimer) clearTimeout(suppressTimer);
        suppressTimer = setTimeout(() => { tooltipSuppressed = false; }, 600);
    };
    canvas.addEventListener('touchend',    endTouch, { passive: false });
    canvas.addEventListener('touchcancel', endTouch, { passive: false });
}

export function externalTooltipHandler(context) {
    const { chart, tooltip } = context;
    const el = getTooltipEl();

    // Just-lifted: refuse to paint so nothing can re-surface the tooltip.
    if (tooltipSuppressed) {
        el.style.opacity = '0';
        return;
    }

    if (tooltip.opacity === 0) {
        el.style.opacity = '0';
        return;
    }

    if (tooltip.body) {
        const bodies = [];
        tooltip.body.forEach((bodyItem, i) => {
            const color = tooltip.labelTextColors?.[i] ?? '#e2e8f0';
            bodyItem.lines.forEach(line => bodies.push({ html: line, color }));
        });
        setTooltipContent(el, tooltip.title || [], bodies);
    }

    // Placement is solved in viewport px. The canvas rect and the tooltip's
    // own rect already are; Chart.js's caret and chartArea are in the chart's
    // CSS px, which body zoom scales — see ui-zoom.js.
    const z = uiZoom();
    const canvasRect = chart.canvas.getBoundingClientRect();
    const chartArea  = {
        top:   chart.chartArea.top   * z,
        left:  chart.chartArea.left  * z,
        right: chart.chartArea.right * z,
    };

    el.style.opacity = '1';
    const elRect = el.getBoundingClientRect();

    const caretX = canvasRect.left + tooltip.caretX * z;
    const caretY = canvasRect.top  + tooltip.caretY * z;

    let top, minLeft, maxLeft;
    if (lastInteractionWasTouch) {
        // Touch: pin to the top of the whole chart card (over the header /
        // controls strip) so it's clear of the finger and the plot entirely.
        const block     = chart.canvas.closest('.chart_block');
        const blockRect = block ? block.getBoundingClientRect() : canvasRect;
        top     = blockRect.top + 8;
        minLeft = blockRect.left + 8;
        maxLeft = blockRect.right - elRect.width - 8;
    } else {
        // Mouse: float above the point; flip below only near the top edge.
        const spaceAbove = tooltip.caretY * z - chartArea.top;
        top = (spaceAbove >= elRect.height + TOOLTIP_GAP)
            ? caretY - elRect.height - TOOLTIP_GAP
            : caretY + TOOLTIP_GAP;
        minLeft = canvasRect.left + chartArea.left;
        maxLeft = canvasRect.left + chartArea.right - elRect.width;
    }

    const left = Math.min(Math.max(caretX - elRect.width / 2, minLeft), maxLeft);

    el.style.top  = `${top / z}px`;
    el.style.left = `${left / z}px`;
}
