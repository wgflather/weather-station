// day-periods.js
//
// The history modal's single-day summary: one row per period (All day,
// Daylight, Night), each a low–high bar on a scale shared by all three, with
// a tick at the period average.
//
// It replaced a 3x3 table of avg / high / low. Two of All day's three numbers
// always repeated another row (its high is Daylight's or Night's high, its low
// likewise), every cell repeated the unit, and comparing day against night
// meant reading nine near-identical strings. On a shared scale the comparison
// is the picture — a night that ran colder sits further left — and the unit is
// written once, in the header.
//
// Coverage is shown because blackouts are routine at this station: a day can
// lose its warmest three hours and still produce a confident "Daylight avg".
// The header gives the day's recorded hours and a period whose window is
// mostly missing is flagged partial, counted from the chart's own hourly
// points so the flag agrees with the gaps drawn below it.

import { periodColor } from './daily-chart.js';
import { formatTimeOfDay } from './time-format.js';
import { unitFor } from './metric-units.js';

const PERIOD_NAMES = { fullDay: 'All day', day: 'Daylight', night: 'Night' };
const ORDER        = ['fullDay', 'day', 'night'];
const METRIC_NAMES = {
    temperature: 'Temperature', pressure: 'Pressure',
    humidity: 'Humidity', surfaceWetness: 'Surface wetness',
};

// Below this share of a window's hours on record, its numbers describe the
// part that survived rather than the period, and the row says so.
const PARTIAL_BELOW = 0.8;
const HOUR_MS       = 3600000;

/**
 * Hourly buckets a window touches, and how many of them hold a point.
 * `points` are chart points ({ hour: ISO }) — pass the previous day's as well
 * for a Night window, which starts the evening before.
 */
export function hourCoverage(points, window) {
    if (!window) return null;
    const start = Math.floor(new Date(window.start).getTime() / HOUR_MS) * HOUR_MS;
    const end   = new Date(window.end).getTime();
    const have  = new Set(points.map(p => new Date(p.hour).getTime()));

    let expected = 0, recorded = 0;
    for (let t = start; t < end; t += HOUR_MS) {
        expected++;
        if (have.has(t)) recorded++;
    }
    return expected ? { recorded, expected } : null;
}

export function clearDayPeriods(container) {
    container.replaceChildren();
}

/**
 * @param stats     { fullDay, day, night } → { avg, high, low } or null
 * @param windows   { day, night } → { start, end } ISO, or null before the split
 * @param coverage  { fullDay, day, night } → { recorded, expected } or null
 */
export function renderDayPeriods(container, { metric, stats, windows, coverage }) {
    const rows = ORDER.map(period => ({ period, s: stats[period] }));
    const present = rows.filter(r => r.s && r.s.low != null && r.s.high != null);

    // One scale for all three rows, spanning exactly the day's lowest to highest
    // reading — so All day fills its track and Daylight / Night read as the part of
    // it they covered. It was padded by 4% each side once, which left a gap at both
    // ends of every bar, All day's included, and read as missing data. A flat day
    // (hi === lo) gets a token span so the arithmetic has something to divide by.
    const lo   = Math.min(...present.map(r => r.s.low));
    const hi   = Math.max(...present.map(r => r.s.high));
    const pad  = hi > lo ? 0 : 0.5;
    const pct  = v => ((v - (lo - pad)) / ((hi + pad) - (lo - pad))) * 100;
    const fmt  = v => (v != null ? Number(v).toFixed(1) : '–');

    const head = el('div', 'hist-periods-head');
    const unit  = unitFor(metric).trim();
    const title = el('span', 'hist-periods-metric', METRIC_NAMES[metric] ?? metric);
    // Its own span: the heading is uppercased, and "HPA" is not a unit.
    if (unit) title.append(' · ', el('span', 'hist-periods-unit', unit));
    head.append(title);
    const day = coverage.fullDay;
    if (day) {
        const c = el('span', 'hist-periods-coverage', `${day.recorded} / ${day.expected} h recorded`);
        c.classList.toggle('is-partial', day.recorded / day.expected < PARTIAL_BELOW);
        head.append(c);
    }

    const cols = el('div', 'hist-periods-cols');
    cols.setAttribute('aria-hidden', 'true');
    cols.append(el('span'), el('span', 'hist-col-range', 'Low – High'), el('span', 'hist-col-avg', 'Avg'));

    const prevEvening = eveningBeforeNote(stats.night, stats.fullDay);

    container.replaceChildren(head, cols, ...rows.map(({ period, s }) =>
        buildRow(period, s, windows?.[period], coverage[period], pct, fmt, metric,
                 period === 'night' ? prevEvening : null)));
}

/**
 * Night runs from the previous sunset, so its range can reach past anything this
 * date recorded — a warm evening before a cooler day. Its bar then outruns All day's,
 * which reads as wrong until it is explained. The inference is exact rather than a
 * guess: Night's hours on this date are inside All day too, so any Night extreme
 * beyond All day's can only have come from the evening before.
 */
function eveningBeforeNote(night, fullDay) {
    if (!night || !fullDay) return null;
    const high = night.high != null && fullDay.high != null && night.high > fullDay.high;
    const low  = night.low  != null && fullDay.low  != null && night.low  < fullDay.low;
    // Short enough for one line in the desktop name column; it fires on roughly a
    // third of dates here, so a two-line note would make Night's row the tall one often.
    if (high && low) return 'high & low: prev evening';
    if (high)        return 'high: prev evening';
    if (low)         return 'low: prev evening';
    return null;
}

function buildRow(period, s, window, cov, pct, fmt, metric, note) {
    const row = el('div', 'hist-period-row');
    row.dataset.period = period;
    row.style.setProperty('--period-color', periodColor(period));

    const name  = el('div', 'hist-period-name');
    const label = el('span', 'hist-period-label');
    label.append(el('span', null, PERIOD_NAMES[period]));

    const meta = el('span', 'hist-period-window');
    if (window) {
        // Night runs from the previous evening, which this date's chart does not
        // show — said outright, or the row reads as if it sat inside the date.
        meta.append(formatTimeOfDay(window.start));
        if (period === 'night') meta.append(el('span', 'hist-period-prev', ' prev'));
        meta.append(`–${formatTimeOfDay(window.end)}`);
    }
    const partial = period !== 'fullDay' && cov && cov.recorded / cov.expected < PARTIAL_BELOW;
    if (partial) {
        const flag = el('span', 'hist-period-partial', `${cov.recorded}/${cov.expected} h`);
        flag.title = `Only ${cov.recorded} of this period's ${cov.expected} hours were recorded`;
        // A separate span so phones can drop it and put the flag on its own line.
        if (window) meta.append(el('span', 'hist-period-sep', ' · '));
        meta.append(flag);
    }
    if (meta.childNodes.length) label.append(meta);
    if (note) label.append(el('span', 'hist-period-note', note));
    name.append(el('i', 'hist-period-dot'), label);

    const usable = s && s.low != null && s.high != null;
    row.classList.toggle('is-unavailable', !usable);

    const low  = el('span', 'hist-period-val hist-period-low',  usable ? fmt(s.low)  : '');
    const high = el('span', 'hist-period-val hist-period-high', usable ? fmt(s.high) : '');
    const track = el('div', 'hist-period-track');
    if (usable) {
        const bar = el('i', 'hist-period-bar');
        bar.style.left  = `${pct(s.low)}%`;
        bar.style.width = `${Math.max(pct(s.high) - pct(s.low), 0.8)}%`;
        track.append(bar);
        if (s.avg != null) {
            const tick = el('i', 'hist-period-tick');
            tick.style.left = `${pct(s.avg)}%`;
            track.append(tick);
        }
    } else {
        track.append(el('span', 'hist-period-none', 'No data'));
    }

    const avg = el('span', 'hist-period-val hist-period-avg', usable ? fmt(s.avg) : '–');

    const unit = unitFor(metric);
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', usable
        ? `${PERIOD_NAMES[period]}: low ${fmt(s.low)}${unit}, high ${fmt(s.high)}${unit}, average ${fmt(s.avg)}${unit}`
          + (partial ? `, only ${cov.recorded} of ${cov.expected} hours recorded` : '')
          + (note ? `; ${note}` : '')
        : `${PERIOD_NAMES[period]}: no data`);

    row.append(name, low, track, high, avg);
    return row;
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}
