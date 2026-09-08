import { renderWeatherChart } from './weather-chart.js';
import { renderDailyChart, periodColor, DEFAULT_PERIODS } from './daily-chart.js';
import { createAvailableDates, isoDateKey } from './available-dates.js';
import { formatTimeOfDay } from './time-format.js';
import { formatMetricValue } from './metric-units.js';
import { renderSummaryCards, clearSummaryCards } from './summary-cards.js';
import { enterModal, exitModal } from './modal-shell.js';

/* =========================================================
   HISTORY MODAL
   Single-day views: hourly chart + day stats bar.
   Multi-day views (7 / 14 / 30): daily chart + period stats bar.
   Both views share the same Avg / High / Low bar above the chart.
========================================================= */

// ── State ─────────────────────────────────────────────────────────────────────
let currentDate   = null;
let currentMetric = 'temperature';
// A number of days ending yesterday, or the string 'month' for a calendar month.
// Kept as one value because every caller only ever asks "which view am I in".
let currentPeriod = 1;
let currentMonth  = null; // 'YYYY-MM', only meaningful while currentPeriod === 'month'
let initialized   = false;
let datePicker    = null;

const availableDates = createAvailableDates('/api/weather/history/available-dates');

// ── Helpers ───────────────────────────────────────────────────────────────────
function yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return isoDateKey(d);
}

function subtractDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return isoDateKey(new Date(y, m - 1, d - days));
}

function formatDateRange(fromStr, toStr) {
    const [fy, fm, fd] = fromStr.split('-').map(Number);
    const [ty, tm, td] = toStr.split('-').map(Number);
    const from = new Date(fy, fm - 1, fd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const to   = new Date(ty, tm - 1, td).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${from} – ${to}`;
}

// ── Period breakdown ──────────────────────────────────────────────────────────
// Keys match the /daily and /daily/summary payload: { date, fullDay, day, night }.
export const PERIODS = ['fullDay', 'day', 'night'];

// Which periods the reader wants drawn, remembered PER METRIC.
//
// It was one shared Set, so that hiding Night survived switching metric or range —
// re-applying a default on every tab would make the toggle useless. That still holds
// within a metric, but a single Set cannot also carry per-metric defaults: pressure opens
// on All day alone while temperature opens on Daylight + Night (see DEFAULT_PERIODS), and
// with one Set the first metric visited would dictate the rest. Keyed by metric, a choice
// made on temperature sticks for temperature without leaking onto pressure.
const shownByMetric = new Map();

// Metrics whose reader has explicitly switched All day *off*. A range that mixes dates with
// and without the day/night split turns All day back on by itself (see loadMultiDay), and
// without this it would keep turning back on after every deliberate dismissal.
const allDayDismissed = new Set();

function shownPeriodsFor(metric) {
    if (!shownByMetric.has(metric)) {
        shownByMetric.set(metric, new Set(DEFAULT_PERIODS[metric] ?? ['fullDay']));
    }
    return shownByMetric.get(metric);
}

// Which periods have data in the range currently loaded. Tracked separately from
// shownPeriods because "hidden by choice" and "nothing to show" need different
// treatment, and the legend is rebuilt from this on every load.
const availablePeriods = new Set();

// Last multi-day payload, kept so toggling a period re-draws from memory instead
// of re-fetching a range the browser already has.
let lastSummaries = null;
let lastRange     = null;

function periodRow(period) {
    return document.querySelector(`.hist-period-row[data-period="${period}"]`);
}

/** Avg / high / low for one period block, or null when it holds nothing for this metric. */
function statsFor(block, metric) {
    if (!block) return null;
    const avg = block[metric + 'Avg'], high = block[metric + 'Max'], low = block[metric + 'Min'];
    if (avg == null && high == null && low == null) return null;
    return { avg, high, low };
}

function resetPeriods() {
    for (const period of PERIODS) {
        const row = periodRow(period);
        if (!row) continue;
        row.classList.remove('is-unavailable');
        row.querySelectorAll('.hist-period-val').forEach(el => { el.textContent = '–'; });
        const caption = row.querySelector('.hist-period-window');
        if (caption) { caption.textContent = ''; caption.hidden = true; }
    }
}

/**
 * Paint the three rows. A period with no data in range is disabled rather than
 * hidden — a missing Daylight row is itself information (dates rolled up before
 * the day/night split have an All day row alone).
 *
 * `windows` carries the sunrise/sunset boundaries each period was measured over,
 * keyed like the rows. It is only meaningful for a single date — across a range
 * every day has its own sunrise — so callers pass null for the multi-day views
 * and the captions stay off.
 */
function renderPeriods(byPeriod, metric, windows = null) {
    for (const period of PERIODS) {
        const row = periodRow(period);
        if (!row) continue;

        // Night runs from the previous evening to this morning, so the caption is the
        // only thing on screen that says which hours a Night row actually covers.
        const window = windows?.[period];
        const caption = row.querySelector('.hist-period-window');
        if (caption) {
            caption.textContent = window
                ? `${formatTimeOfDay(window.start)} → ${formatTimeOfDay(window.end)}`
                : '';
            caption.hidden = !window;
        }

        // The swatch is the chart's legend key, so it tracks the line colour —
        // which for All day follows the selected metric.
        row.style.setProperty('--period-color', periodColor(period));

        const stats = byPeriod[period];
        setAvailability(period, !!stats);
        row.classList.toggle('is-unavailable', !stats);

        const cell = (name) => row.querySelector(`.hist-period-val[data-stat="${name}"]`);
        for (const [name, value] of [['avg', stats?.avg], ['high', stats?.high], ['low', stats?.low]]) {
            cell(name).textContent = formatMetricValue(value, metric);
        }
    }
}

/**
 * Roll a whole range up into one row: the extremes are true extremes, while the
 * average is an unweighted mean of daily means — days differ in reading count,
 * but the daily table doesn't carry one, so this matches what the bar showed before.
 */
function rangeStats(summaries, period, metric) {
    let low = Infinity, high = -Infinity, sum = 0, count = 0;

    for (const summary of summaries) {
        const block = summary[period];
        if (!block) continue;
        const mn = block[metric + 'Min'], mx = block[metric + 'Max'], av = block[metric + 'Avg'];
        if (mn != null) low  = Math.min(low, mn);
        if (mx != null) high = Math.max(high, mx);
        if (av != null) { sum += av; count++; }
    }

    if (!count && low === Infinity && high === -Infinity) return null;
    return {
        avg:  count ? sum / count : null,
        high: high === -Infinity ? null : high,
        low:  low === Infinity ? null : low,
    };
}

function setAvailability(period, available) {
    available ? availablePeriods.add(period) : availablePeriods.delete(period);
}

/** Periods currently drawn: wanted by the reader and actually carrying data. */
function activePeriods() {
    const shown = shownPeriodsFor(currentMetric);
    const wanted = PERIODS.filter(p => shown.has(p) && availablePeriods.has(p));
    if (wanted.length) return wanted;

    // Nothing the reader asked for exists in this range. Month view makes that reachable:
    // temperature and humidity open on Daylight + Night, and any month before the day/night
    // split has All day rows alone — so the intersection is empty and renderDailyChart would
    // return without drawing, leaving a stale or blank canvas that reads as a broken tab.
    // Falling back to whatever the range does have shows the data instead of hiding it.
    return PERIODS.filter(p => availablePeriods.has(p));
}

// ── Chart legend (multi-day only) ─────────────────────────────────────────────
// The legend doubles as the series toggle. It lives with the chart rather than in
// the period table because the table is a single-day readout — a chart of one day's
// own hours has no period series to switch off.

const PERIOD_NAMES = { fullDay: 'All day', day: 'Daylight', night: 'Night' };

function renderLegend(metric) {
    const legend = document.getElementById('hist-legend');
    if (!legend) return;

    legend.replaceChildren();
    const drawable = PERIODS.filter(p => availablePeriods.has(p));
    legend.hidden = drawable.length === 0;

    const note = document.getElementById('hist-chart-note');
    if (note) note.hidden = legend.hidden;

    for (const period of drawable) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'hist-legend-item';
        item.dataset.period = period;
        item.setAttribute('aria-pressed', String(shownPeriodsFor(metric).has(period)));
        item.style.setProperty('--period-color', periodColor(period));

        const swatch = document.createElement('i');
        swatch.className = 'hist-legend-swatch';
        const name = document.createElement('span');
        name.textContent = PERIOD_NAMES[period] ?? period;

        item.append(swatch, name);
        legend.append(item);
    }
}

document.getElementById('hist-legend')?.addEventListener('click', (e) => {
    const item = e.target.closest('.hist-legend-item');
    if (!item) return;

    const period = item.dataset.period;
    // Hiding the last visible series would leave an empty chart, and the only way
    // back in is the control being switched off.
    const shown = shownPeriodsFor(currentMetric);
    if (shown.has(period) && activePeriods().length === 1) return;

    shown.has(period) ? shown.delete(period) : shown.add(period);
    item.setAttribute('aria-pressed', String(shown.has(period)));

    if (period === 'fullDay') {
        shown.has(period)
            ? allDayDismissed.delete(currentMetric)
            : allDayDismissed.add(currentMetric);
    }

    if (lastSummaries && lastRange) {
        renderDailyChart(lastSummaries, currentMetric, 'hist-modal-chart',
                         lastRange.from, lastRange.to, activePeriods());
    }
});

// ── Month selector ────────────────────────────────────────────────────────────
// Populated once from the months that actually hold data, so the control cannot offer a
// month that would draw an empty chart. Deliberately a plain <select> rather than a second
// flatpickr: the choice is one of a short, known list, and flatpickr's month mode would
// need a plugin the page does not load.

/** "September 2026" in the viewer's locale, from a 'YYYY-MM' key. */
function monthLabel(key) {
    const [year, month] = key.split('-').map(Number);
    return new Date(year, month - 1, 1)
        .toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/** First and last day of `key`, the last clamped to yesterday for the current month. */
function monthBounds(key) {
    const [year, month] = key.split('-').map(Number);
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastOfMonth = isoDateKey(new Date(year, month, 0));
    // The rollup only writes a date once it is over, so today has no row and asking for it
    // would stretch the axis across a day that can never fill in.
    const to = lastOfMonth > yesterday() ? yesterday() : lastOfMonth;
    return { from, to };
}

async function initMonthSelect() {
    const select = document.getElementById('hist-month-select');
    if (!select) return;

    const months = await availableDates.loadAvailableMonths();
    select.replaceChildren();

    for (const key of months) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = monthLabel(key);
        select.append(option);
    }

    // Newest month first is what a reader wants by default, but the list stays chronological
    // — a dropdown that runs backwards is harder to scan than one that starts at the end.
    currentMonth = months.length ? months[months.length - 1] : null;
    if (currentMonth) select.value = currentMonth;
    select.disabled = months.length === 0;

    select.addEventListener('change', () => {
        currentMonth = select.value;
        loadRange('month');
    });
}

// ── Date picker ───────────────────────────────────────────────────────────────
async function initDatePicker() {
    const [y, m] = currentDate.split('-').map(Number);
    await availableDates.loadMonth(y, m - 1);

    datePicker = flatpickr(document.getElementById('hist-date-input'), availableDates.pickerOptions({
        defaultDate: currentDate,
        // Append inside the modal so flatpickr's position math runs within the
        // fixed stacking context, avoiding the viewport jump on first open.
        appendTo:    document.getElementById('hist-modal'),
        onOpen: (_s, _str, instance) => {
            // On mobile, flatpickr's JS-calculated position (near the input) is
            // overridden by CSS !important rules, but there's a single paint frame
            // where the JS position is visible — fix it synchronously here first.
            if (window.innerWidth <= 600) {
                const cal = instance.calendarContainer;
                cal.style.top       = 'auto';
                cal.style.bottom    = '24px';
                cal.style.left      = '50%';
                cal.style.right     = 'auto';
                cal.style.transform = 'translateX(-50%)';
                cal.style.width     = `${Math.min(272, window.innerWidth - 32)}px`;
            }
        },
        onChange: (selectedDates) => {
            if (!selectedDates[0]) return;
            const dateStr = isoDateKey(selectedDates[0]);
            if (dateStr !== currentDate) {
                currentDate = dateStr;
                loadRange(currentPeriod);
            }
        },
    }));
}

// ── Single-day stats bar (from daily summary API) ─────────────────────────────
async function loadDaySummaryStats(dateStr, metric) {
    try {
        const res = await fetch(`/api/weather/history/daily/summary?date=${dateStr}`);
        if (!res.ok) return;
        const summary = await res.json();
        // The single-day chart is hourly, so the periods are a reading aid here only —
        // there is no per-period series to toggle on a chart of one day's own hours.
        // This is also the only view where the windows mean anything, so it is the one
        // that captions them.
        renderPeriods(
            {
                fullDay: statsFor(summary.fullDay, metric),
                day:     statsFor(summary.day,     metric),
                night:   statsFor(summary.night,   metric),
            },
            metric,
            { day: summary.dayPeriod, night: summary.nightPeriod },
        );
    } catch { /* rows stay at "–" */ }
}

// ── Single-day chart ──────────────────────────────────────────────────────────
async function loadDayChart(dateStr, metric) {
    const emptyEl = document.getElementById('hist-chart-empty');
    const canvas  = document.getElementById('hist-modal-chart');

    try {
        const res = await fetch(`/api/weather/history/chart/day?date=${dateStr}&metric=${metric}`);
        if (!res.ok) throw new Error(res.status);
        const dto    = await res.json();
        const points = (dto.chartPoints || []).map(p => ({ hour: p.hour, hourlyValue: p.hourlyValue }));

        if (points.length === 0) {
            canvas.hidden  = true;
            emptyEl.hidden = false;
        } else {
            canvas.hidden  = false;
            emptyEl.hidden = true;
            const [y, m, d] = dateStr.split('-').map(Number);
            renderWeatherChart(points, metric, 60, {
                canvasId: 'hist-modal-chart',
                showNow:  false,
                refDate:  new Date(y, m - 1, d),
            });
        }
    } catch {
        canvas.hidden  = true;
        emptyEl.hidden = false;
    }
}

/**
 * Put the chart area into its "nothing to show" state: no canvas, no legend, no key,
 * just the empty message. The legend and the caption describe a chart, so they cannot
 * outlive one — `loadRange` switches them on for a multi-day view before the fetch has
 * resolved, and a range that comes back empty must undo that.
 */
function hideChartChrome() {
    document.getElementById('hist-modal-chart').hidden = true;
    document.getElementById('hist-chart-empty').hidden = false;
    document.getElementById('hist-legend').hidden      = true;
    document.getElementById('hist-chart-note').hidden  = true;
}

// ── Multi-day: single fetch drives both the legend and the daily chart ────────
async function loadMultiDay(fromStr, toStr, metric) {
    const emptyEl = document.getElementById('hist-chart-empty');
    const canvas  = document.getElementById('hist-modal-chart');

    try {
        // One call for the whole view: { days, summary }. The chart and the cards are both
        // metric-specific and the range is reloaded on every metric tab anyway, so splitting
        // them only bought a second round trip.
        const res = await fetch(
            `/api/weather/history/daily?from=${fromStr}&to=${toStr}&metric=${metric}`);
        if (!res.ok) throw new Error(res.status);
        const payload = await res.json();
        // Each day is { date, fullDay, day, night }; the periods stay nested all the way to
        // the chart, so nothing downstream can average the day and night blocks in with All day.
        const summaries = payload.days ?? [];

        if (!summaries.length) {
            hideChartChrome();
            clearSummaryCards(document.getElementById('hist-summary-cards'));
            return;
        }

        // Availability drives the legend; the numbers themselves are the cards' job now.
        for (const period of PERIODS) {
            setAvailability(period, rangeStats(summaries, period, metric) != null);
        }

        // A range can straddle the day/night split — every month before it has All day rows
        // alone, every month after has all three. Availability is per *range*, so one such
        // date is enough to mark Daylight and Night "available" and the presets that open on
        // them draw lines over only part of the chart, with the band stretching across the
        // rest and nothing inside it. Turning All day on covers the whole range, so the
        // earlier dates get a line instead of an empty band.
        //
        // Counted per day rather than taken from availability, which cannot tell "present
        // throughout" from "present once". Unless the reader has dismissed it, in which case
        // their choice stands.
        const daysWithFull = summaries.filter(d => statsFor(d.fullDay, metric)).length;
        const daysWithSplit = summaries.filter(
            d => statsFor(d.day, metric) || statsFor(d.night, metric)).length;

        if (daysWithSplit > 0 && daysWithSplit < daysWithFull && !allDayDismissed.has(metric)) {
            shownPeriodsFor(metric).add('fullDay');
        }

        renderLegend(metric);

        lastSummaries = summaries;
        lastRange     = { from: fromStr, to: toStr };

        canvas.hidden  = false;
        emptyEl.hidden = true;
        renderDailyChart(summaries, metric, 'hist-modal-chart', fromStr, toStr, activePeriods());

        renderSummaryCards(document.getElementById('hist-summary-cards'), payload.summary, metric);

    } catch {
        hideChartChrome();
        clearSummaryCards(document.getElementById('hist-summary-cards'));
    }
}

// ── Drill-down: a summary card opens the day it names ────────────────────────
/**
 * Switch to the single-day view for `dateStr`, as though the reader had picked that
 * date and the Day tab themselves.
 *
 * Both other controls have to be brought along or the modal contradicts itself: the
 * period tabs own their `.active` class inside their own click handler, so without this
 * the view shows one day while "7D" stays lit; and the flatpickr input keeps whatever it
 * was last set to, so the picker would name a different date than the chart below it.
 *
 * Note what a "Coldest night avg" card opens. A NIGHT row for date D covers D-1's sunset to
 * D's sunrise, so the day this lands on holds only the second half of that night — the
 * evening that began it is on the previous day's chart. The coldest hour is normally just
 * before dawn and so is in view, but this is deliberately the date the card names rather
 * than the one containing most of its window: opening Aug 30 from a card captioned Aug 31
 * would be the more surprising rule.
 */
function goToDay(dateStr) {
    currentDate   = dateStr;
    currentPeriod = 1;

    document.querySelectorAll('#hist-period-tabs .history-period-btn')
        .forEach(b => b.classList.toggle('active', b.dataset.days === '1'));

    // Second argument false: setting the date must not fire onChange, which would call
    // loadRange again and race the one below.
    datePicker?.setDate(dateStr, false);

    // isDateEnabled() answers from cache only, and initDatePicker loads just the month it
    // opened on. A 30-day range reaches into the previous month, so a card can send the
    // picker to a month it has never fetched — where every cell reads as disabled until
    // something triggers a load. Not awaited: it only affects what the picker shows if the
    // reader opens it later, and the chart below should not wait on it.
    const [year, month] = dateStr.split('-').map(Number);
    availableDates.loadMonth(year, month - 1);

    loadRange(1);
}

// Delegated, because the cards are rebuilt on every load. Only cards that named a single
// date are buttons carrying data-date; the trend and diurnal cards match nothing here.
document.getElementById('hist-summary-cards')?.addEventListener('click', (e) => {
    const card = e.target.closest('.hist-summary-card[data-date]');
    if (card) goToDay(card.dataset.date);
});

// ── Metric tabs ───────────────────────────────────────────────────────────────
// The wiring from here down is optional-chained: this module owns the
// dashboard's history modal, and every entry point into it is a listener on
// that markup. On a page without it the module simply binds nothing, instead
// of throwing at import time and taking the rest of that page's scripts down.
document.getElementById('hist-metric-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.history-metric-tab');
    if (!btn || btn.classList.contains('active')) return;
    document.querySelectorAll('#hist-metric-tabs .history-metric-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMetric = btn.dataset.metric;
    if (currentDate) loadRange(currentPeriod);
});

// ── Period tabs ───────────────────────────────────────────────────────────────
document.getElementById('hist-period-tabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.history-period-btn');
    if (!btn || btn.classList.contains('active')) return;
    document.querySelectorAll('#hist-period-tabs .history-period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const days = btn.dataset.days;
    currentPeriod = days === 'month' ? 'month' : Number(days);
    if (currentDate) loadRange(currentPeriod);
});

// ── Load a range ──────────────────────────────────────────────────────────────
async function loadRange(days) {
    const chartTitle    = document.getElementById('hist-chart-title');
    const pickerWrapper = document.getElementById('hist-picker-wrapper');
    const dateInput     = document.getElementById('hist-date-input');

    resetPeriods();
    availablePeriods.clear();

    // Dropped before each load so a toggle can never redraw the previous range's data.
    lastSummaries = null;
    lastRange     = null;

    const monthView = days === 'month';
    const singleDay = days === 1;

    // Each view owns one control: a date for the single day, a month for the month, and
    // neither for the rolling ranges, whose window is fixed relative to yesterday.
    pickerWrapper.hidden = monthView;
    pickerWrapper.classList.toggle('hist-picker-disabled', !singleDay);
    dateInput.disabled = !singleDay;
    document.getElementById('hist-month-wrapper').hidden = !monthView;

    // The two views answer different questions and swap their whole summary area: one date
    // gets the per-period breakdown with its sunrise/sunset windows, a range gets the stat
    // cards plus a legend that doubles as the series toggle. Showing both would put a
    // range-wide average next to a single day's, which is the confusion the cards replaced.
    document.getElementById('hist-periods').hidden = !singleDay;
    document.getElementById('hist-summary-cards').hidden = singleDay;
    document.getElementById('hist-legend').hidden = singleDay;
    // The band only exists on the multi-day chart, so its caption goes with it.
    document.getElementById('hist-chart-note').hidden = singleDay;
    if (singleDay) clearSummaryCards(document.getElementById('hist-summary-cards'));

    if (singleDay) {
        chartTitle.textContent = 'Hourly';
        await Promise.all([
            loadDaySummaryStats(currentDate, currentMetric),
            loadDayChart(currentDate, currentMetric),
        ]);
    } else if (monthView) {
        if (!currentMonth) {
            hideChartChrome();
            clearSummaryCards(document.getElementById('hist-summary-cards'));
            return;
        }
        const { from, to } = monthBounds(currentMonth);
        chartTitle.textContent = monthLabel(currentMonth);
        await loadMultiDay(from, to, currentMetric);
    } else {
        chartTitle.textContent = 'Daily';
        const toDate   = yesterday();
        const fromDate = subtractDays(toDate, days - 1);
        await loadMultiDay(fromDate, toDate, currentMetric);
    }
}

// ── Init (lazy — runs only on first modal open) ───────────────────────────────
async function initModal() {
    if (initialized) return;
    initialized = true;
    currentDate = yesterday();
    await Promise.all([initDatePicker(), initMonthSelect()]);
    await loadRange(currentPeriod);
}

// ── Modal open / close ────────────────────────────────────────────────────────
// Scroll locking and focus containment come from modal-shell.js, shared with
// the astro modal — see the note there on why they can't be per-modal.
const modal = document.getElementById('hist-modal');

function openHistModal() {
    modal.classList.add('open');
    modal.removeAttribute('aria-hidden');
    enterModal(modal);
    document.getElementById('hist-modal-close').focus();
    window.setStarFieldModalDim?.(true);
    initModal();
}

function closeHistModal() {
    exitModal(modal);
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    window.setStarFieldModalDim?.(false);
}

document.getElementById('chart-history-btn')?.addEventListener('click', openHistModal);
document.getElementById('hist-modal-close')?.addEventListener('click', closeHistModal);
modal?.querySelector('.hist-modal-backdrop')?.addEventListener('click', closeHistModal);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('open')) closeHistModal();
});
