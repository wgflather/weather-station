import { renderWeatherChart } from './weather-chart.js';
import { renderDailyChart, periodColor } from './daily-chart.js';
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
let currentPeriod = 1;
let initialized   = false;

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

// Which periods the reader wants drawn. Module-level so hiding Night once survives
// switching metric or range — re-hiding it on every tab would make the toggle useless.
const shownPeriods = new Set(PERIODS);

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
        row.style.setProperty('--period-color', periodColor(period, metric));

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
    return PERIODS.filter(p => shownPeriods.has(p) && availablePeriods.has(p));
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

    for (const period of drawable) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'hist-legend-item';
        item.dataset.period = period;
        item.setAttribute('aria-pressed', String(shownPeriods.has(period)));
        item.style.setProperty('--period-color', periodColor(period, metric));

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
    if (shownPeriods.has(period) && activePeriods().length === 1) return;

    shownPeriods.has(period) ? shownPeriods.delete(period) : shownPeriods.add(period);
    item.setAttribute('aria-pressed', String(shownPeriods.has(period)));

    if (lastSummaries && lastRange) {
        renderDailyChart(lastSummaries, currentMetric, 'hist-modal-chart',
                         lastRange.from, lastRange.to, activePeriods());
    }
});

// ── Date picker ───────────────────────────────────────────────────────────────
async function initDatePicker() {
    const [y, m] = currentDate.split('-').map(Number);
    await availableDates.loadMonth(y, m - 1);

    flatpickr(document.getElementById('hist-date-input'), availableDates.pickerOptions({
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

// ── Multi-day: single fetch drives both the legend and the daily chart ────────
async function loadMultiDay(fromStr, toStr, days, metric) {
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
            canvas.hidden  = true;
            emptyEl.hidden = false;
            clearSummaryCards(document.getElementById('hist-summary-cards'));
            return;
        }

        // Availability drives the legend; the numbers themselves are the cards' job now.
        for (const period of PERIODS) {
            setAvailability(period, rangeStats(summaries, period, metric) != null);
        }
        renderLegend(metric);

        lastSummaries = summaries;
        lastRange     = { from: fromStr, to: toStr };

        canvas.hidden  = false;
        emptyEl.hidden = true;
        renderDailyChart(summaries, metric, 'hist-modal-chart', fromStr, toStr, activePeriods());

        renderSummaryCards(document.getElementById('hist-summary-cards'), payload.summary, metric);

    } catch {
        if (canvas) canvas.hidden = true;
        emptyEl.hidden = false;
        clearSummaryCards(document.getElementById('hist-summary-cards'));
    }
}

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
    currentPeriod = Number(btn.dataset.days);
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

    const singleDay = days === 1;
    // Disable the date picker in multi-day views — it only applies to single day.
    pickerWrapper.classList.toggle('hist-picker-disabled', !singleDay);
    dateInput.disabled = !singleDay;

    // The two views answer different questions and swap their whole summary area: one date
    // gets the per-period breakdown with its sunrise/sunset windows, a range gets the stat
    // cards plus a legend that doubles as the series toggle. Showing both would put a
    // range-wide average next to a single day's, which is the confusion the cards replaced.
    document.getElementById('hist-periods').hidden = !singleDay;
    document.getElementById('hist-summary-cards').hidden = singleDay;
    document.getElementById('hist-legend').hidden = singleDay;
    if (singleDay) clearSummaryCards(document.getElementById('hist-summary-cards'));

    if (singleDay) {
        chartTitle.textContent = 'Hourly';
        await Promise.all([
            loadDaySummaryStats(currentDate, currentMetric),
            loadDayChart(currentDate, currentMetric),
        ]);
    } else {
        chartTitle.textContent = 'Daily';
        const toDate   = yesterday();
        const fromDate = subtractDays(toDate, days - 1);
        await loadMultiDay(fromDate, toDate, days, currentMetric);
    }
}

// ── Init (lazy — runs only on first modal open) ───────────────────────────────
async function initModal() {
    if (initialized) return;
    initialized = true;
    currentDate = yesterday();
    await initDatePicker();
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
