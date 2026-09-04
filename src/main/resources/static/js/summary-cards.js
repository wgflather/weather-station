// summary-cards.js
//
// The stat cards above the history chart in multi-day views: "Warmest day 31°C
// Aug 30", "Daylight trend +3°C Aug 28 → Sep 3".
//
// The backend decides which cards a metric can answer and what each one is called;
// this module owns only presentation. Values arrive as bare numbers and dates as
// ISO strings, so units come from the same table the chart uses and dates render
// in the viewer's locale — server-formatted text would disagree with the chart
// tooltip sitting directly below it.

import { unitFor } from './metric-units.js';

/** "Aug 30" in the viewer's locale, from a "YYYY-MM-DD" string. */
function shortDate(isoDate) {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatValue(card, metric) {
    if (card.value == null) return '–';
    const unit = unitFor(metric);
    const rounded = Number(card.value).toFixed(1);
    // A trend is a change, so it carries its sign; an extreme is a reading and does not.
    const signed = card.kind === 'TREND' && card.value > 0 ? `+${rounded}` : rounded;
    return `${signed}${unit}`;
}

function formatContext(card) {
    if (card.kind === 'TREND') {
        return card.rangeStart && card.rangeEnd
            ? `${shortDate(card.rangeStart)} → ${shortDate(card.rangeEnd)}`
            : '';
    }
    return shortDate(card.date);
}

/**
 * Render a metric's cards into `container`.
 *
 * Renders however many cards arrive rather than a fixed three — a one-day range
 * has no trend, and a metric may not support one at all. An empty list hides the
 * row entirely instead of leaving placeholder frames.
 */
export function renderSummaryCards(container, summary, metric) {
    if (!container) return;

    const cards = summary?.cards ?? [];
    container.replaceChildren();
    container.hidden = cards.length === 0;

    for (const card of cards) {
        const el = document.createElement('div');
        el.className = 'hist-summary-card';
        el.dataset.kind = card.kind;

        const label = document.createElement('span');
        label.className = 'hist-summary-label';
        label.textContent = card.label;

        const value = document.createElement('span');
        value.className = 'hist-summary-value';
        value.textContent = formatValue(card, metric);

        const context = document.createElement('span');
        context.className = 'hist-summary-context';
        context.textContent = formatContext(card);

        el.append(label, value, context);
        container.append(el);
    }
}

/** Blank the cards without collapsing the row, so the layout does not jump while loading. */
export function clearSummaryCards(container) {
    if (!container) return;
    container.replaceChildren();
    container.hidden = true;
}
