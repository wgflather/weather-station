// summary-cards.js
//
// The stat cards above the history chart in multi-day views: "Warmest day 24.6°C
// Aug 30", "Coldest night 8.2°C Aug 31", "Daylight trend +3°C Aug 28 → Sep 3".
//
// The backend decides which cards a metric can answer and what each one is called,
// and the values it sends are period averages for some metrics and stored extremes
// for others — this module renders whatever arrives and owns only presentation, so
// a card whose question changes server-side needs nothing here. Values arrive as
// bare numbers and dates as ISO strings, so units come from the same table the
// chart uses and dates render in the viewer's locale — server-formatted text would
// disagree with the chart tooltip sitting directly below it.
//
// A card carries one of four context shapes and the caption is chosen by which
// fields arrived, not by kind: a single `date`; a `rangeStart`/`rangeEnd` pair of
// days; a `windowStart`/`windowEnd` pair of times, naming a recurring stretch of
// the day and no date at all; or a `date` with a bare `windowStart`, one reading at
// one hour. Matching on fields rather than kind is what lets the backend add a card
// shape without touching this file — two of these arrived that way.
//
// One caption to be aware of: a "Coldest night" date is the morning the night
// ended on, since a night runs from the previous evening's sunset.

import { unitFor } from './metric-units.js';

/** "Aug 30" in the viewer's locale, from a "YYYY-MM-DD" string. */
function shortDate(isoDate) {
    if (!isoDate) return '';
    const [y, m, d] = isoDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * "13:00" from the backend's "13:00:00".
 *
 * Deliberately not run through `Date` and not locale-converted, unlike the dates
 * above. These are wall-clock hours *at the station*, not instants — there is no
 * day attached to convert from. A viewer in another zone must read the hour the
 * station experienced, or the card would disagree with the chart beside it, which
 * resolves its own days in the station's zone too.
 */
function stationHour(isoTime) {
    const match = /^(\d{2}):(\d{2})/.exec(isoTime ?? '');
    return match ? `${match[1]}:${match[2]}` : '';
}

function formatValue(card, metric) {
    if (card.value == null) return '–';
    // Nearly every card is measured in its own tab's unit, and `unitMetric` is the
    // exception the backend flags: the dew point card sits on the humidity tab but
    // reports a temperature spread, and would otherwise read "1.7%".
    const unit = unitFor(card.unitMetric ?? metric);
    const rounded = Number(card.value).toFixed(1);
    // A trend is a change, so it carries its sign; an extreme is a reading and does not.
    const signed = card.kind === 'TREND' && card.value > 0 ? `+${rounded}` : rounded;
    return `${signed}${unit}`;
}

function formatContext(card) {
    // A stretch of the day, not a date. It may wrap past midnight — "23:00–02:00" —
    // so the end reading earlier than the start is correct, not a pair to reorder.
    if (card.windowStart && card.windowEnd) {
        return `${stationHour(card.windowStart)}–${stationHour(card.windowEnd)}`;
    }
    // One reading at one hour. The hour is half the answer — a small dew point gap
    // at 03:00 is an ordinary clear night, the same gap at 14:00 is fog — so it is
    // shown alongside the date rather than rounded away to the day.
    if (card.date && card.windowStart) {
        return `${shortDate(card.date)}, ${stationHour(card.windowStart)}`;
    }
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
 *
 * A card that names a single date is rendered as a <button> carrying that date in
 * `data-date`, so the modal can open that day's hourly chart from it. Which cards
 * those are is decided by the same rule the caption uses — which fields arrived —
 * so nothing here needs to know the metric or the kind. The rest stay plain divs:
 * a trend spans days and a diurnal stretch names no date at all, so there is no
 * single day for either to open, and making the whole row look clickable would
 * leave two of humidity's three cards reading as broken rather than as different.
 *
 * The click itself belongs to the modal. This module owns presentation only, so it
 * marks the card navigable and stops there.
 */
export function renderSummaryCards(container, summary, metric) {
    if (!container) return;

    const cards = summary?.cards ?? [];
    container.replaceChildren();
    container.hidden = cards.length === 0;

    for (const card of cards) {
        const navigable = !!card.date;
        const el = document.createElement(navigable ? 'button' : 'div');
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

        if (navigable) {
            el.type = 'button';
            el.dataset.date = card.date;
            // The visible text is three separate spans, which a screen reader would
            // read as a heading, a number and a date with no statement of what
            // activating the control does.
            el.setAttribute(
                'aria-label',
                `${card.label}, ${value.textContent} on `
                // Some locales abbreviate the month with a trailing period, which would
                // read as a double stop before the sentence that follows.
                + `${context.textContent.replace(/[.\s]+$/, '')}. `
                + `Open this day's hourly chart.`);
        }

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
