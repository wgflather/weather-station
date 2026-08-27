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

    const canvasRect = chart.canvas.getBoundingClientRect();
    const { chartArea } = chart;

    el.style.opacity = '1';
    const elRect = el.getBoundingClientRect();

    const caretX = canvasRect.left + tooltip.caretX;
    const caretY = canvasRect.top  + tooltip.caretY;

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
        const spaceAbove = tooltip.caretY - chartArea.top;
        top = (spaceAbove >= elRect.height + TOOLTIP_GAP)
            ? caretY - elRect.height - TOOLTIP_GAP
            : caretY + TOOLTIP_GAP;
        minLeft = canvasRect.left + chartArea.left;
        maxLeft = canvasRect.left + chartArea.right - elRect.width;
    }

    const left = Math.min(Math.max(caretX - elRect.width / 2, minLeft), maxLeft);

    el.style.top  = `${top}px`;
    el.style.left = `${left}px`;
}
