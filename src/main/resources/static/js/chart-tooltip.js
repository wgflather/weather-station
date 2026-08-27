// chart-tooltip.js
//
// The one floating tooltip element shared by the dashboard's 24-hour chart
// (weather-chart.js) and the history modal's daily chart (daily-chart.js).
//
// Both used to create `#weather-chart-tooltip` themselves and then assume
// different internals: weather-chart replaced innerHTML wholesale on every
// render, daily-chart seeded .title/.body children once at creation and
// queried them on every render. Whichever chart drew first owned the element,
// so the other read into markup it had not built — daily-chart's unguarded
// `titleEl.textContent =` threw the moment weather-chart's last render carried
// no title line, and a surviving body div leaked the dashboard series colour
// into the history tooltip.
//
// Content now has exactly one author: setTooltipContent(). Positioning stays
// with each chart — they flip and clamp against different anchors (plot area
// and card vs viewport), which is genuinely chart-specific.

const TOOLTIP_ID = 'chart-tooltip';

export function getTooltipEl() {
    let el = document.getElementById(TOOLTIP_ID);
    if (!el) {
        el = document.createElement('div');
        el.id        = TOOLTIP_ID;
        el.className = 'chartjs-tooltip';
        document.body.appendChild(el);
    }
    return el;
}

/**
 * Rebuilds the tooltip's contents.
 *
 * @param el     the element from getTooltipEl()
 * @param titles plain-text title lines; set as text, never parsed as markup
 * @param bodies body lines as `{ html, color }` — html because the daily chart
 *               builds a rich two-line body with its own inline styling, color
 *               because the 24-hour chart tints each line per dataset
 */
export function setTooltipContent(el, titles = [], bodies = []) {
    el.textContent = '';

    for (const title of titles) {
        const div = document.createElement('div');
        div.className   = 'chartjs-tooltip-title';
        div.textContent = title;
        el.appendChild(div);
    }

    for (const body of bodies) {
        const div = document.createElement('div');
        div.className = 'chartjs-tooltip-body';
        if (body.color) div.style.color = body.color;
        div.innerHTML = body.html;
        el.appendChild(div);
    }
}

// Hides the tooltip without touching chart state; callers that also need to
// clear Chart.js's active elements do that themselves.
export function hideTooltip() {
    const el = document.getElementById(TOOLTIP_ID);
    if (el) el.style.opacity = '0';
}
