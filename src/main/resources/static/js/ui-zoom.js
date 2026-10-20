// ui-zoom.js
//
// The page is scaled up on large desktop screens with CSS `zoom` on <body>
// (see --ui-zoom in style.css). Under zoom there are two kinds of pixel:
//
//   - viewport px: what getBoundingClientRect(), clientX/Y and innerWidth
//     report — the zoomed, on-screen size;
//   - CSS px: what a style.top/left/right inside <body> is written in, and
//     what offsetWidth and Chart.js's own coordinates (caretX…) report.
//
// One viewport px is `uiZoom()` CSS px. Code that measures something on screen
// and then positions a fixed element there has to convert, or the element
// lands off by the zoom factor — 74px written became 93px on screen at 1.25.

/** The current body zoom; 1 where none applies (phones, tablets, small windows). */
export function uiZoom() {
    const z = parseFloat(getComputedStyle(document.body).zoom);
    return z > 0 ? z : 1;
}

/** A viewport-px length as the CSS px to write into a style inside <body>. */
export function toCssPx(viewportPx) {
    return viewportPx / uiZoom();
}
