import { renderWeatherChart } from './weather-chart.js';
import { renderDailyChart }   from './daily-chart.js';
import { createAvailableDates, isoDateKey } from './available-dates.js';
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

function fmt1(v) { return v != null ? Number(v).toFixed(1) : '–'; }

function formatDateRange(fromStr, toStr) {
    const [fy, fm, fd] = fromStr.split('-').map(Number);
    const [ty, tm, td] = toStr.split('-').map(Number);
    const from = new Date(fy, fm - 1, fd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const to   = new Date(ty, tm - 1, td).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${from} – ${to}`;
}

// ── Stats bar ─────────────────────────────────────────────────────────────────
const UNITS = { temperature: '°C', pressure: ' hPa', humidity: '%' };

function resetStatsBar() {
    document.getElementById('hist-chart-avg').textContent  = '–';
    document.getElementById('hist-chart-high').textContent = '–';
    document.getElementById('hist-chart-low').textContent  = '–';
}

function setStatsBar(avg, high, low, metric) {
    const unit = UNITS[metric] ?? '';
    document.getElementById('hist-chart-avg').textContent  = avg  != null ? `${fmt1(avg)}${unit}`  : '–';
    document.getElementById('hist-chart-high').textContent = high != null ? `${fmt1(high)}${unit}` : '–';
    document.getElementById('hist-chart-low').textContent  = low  != null ? `${fmt1(low)}${unit}`  : '–';
}

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
        const d = await res.json();
        const vals = {
            temperature: [d.temperatureAvg, d.temperatureMax, d.temperatureMin],
            pressure:    [d.pressureAvg,    d.pressureMax,    d.pressureMin],
            humidity:    [d.humidityAvg,     d.humidityMax,    d.humidityMin],
        }[metric] ?? [null, null, null];
        setStatsBar(vals[0], vals[1], vals[2], metric);
    } catch { /* stats bar stays at "–" */ }
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

// ── Multi-day: single fetch drives both stats bar and daily chart ─────────────
async function loadMultiDay(fromStr, toStr, days, metric) {
    const emptyEl = document.getElementById('hist-chart-empty');
    const canvas  = document.getElementById('hist-modal-chart');

    try {
        const res = await fetch(`/api/weather/history/daily?from=${fromStr}&to=${toStr}`);
        if (!res.ok) throw new Error(res.status);
        const records = await res.json();

        if (!records.length) {
            canvas.hidden  = true;
            emptyEl.hidden = false;
            return;
        }

        // Period stats bar
        let minVal = Infinity, maxVal = -Infinity, avgSum = 0, avgCount = 0;
        for (const r of records) {
            const mn = r[metric + 'Min'], mx = r[metric + 'Max'], av = r[metric + 'Avg'];
            if (mn != null) minVal = Math.min(minVal, mn);
            if (mx != null) maxVal = Math.max(maxVal, mx);
            if (av != null) { avgSum += av; avgCount++; }
        }
        setStatsBar(
            avgCount          ? avgSum / avgCount : null,
            maxVal !== -Infinity ? maxVal         : null,
            minVal !== Infinity  ? minVal         : null,
            metric
        );

        canvas.hidden  = false;
        emptyEl.hidden = true;
        renderDailyChart(records, metric, 'hist-modal-chart', fromStr, toStr);

    } catch {
        if (canvas) canvas.hidden = true;
        emptyEl.hidden = false;
    }
}

// ── Metric tabs ───────────────────────────────────────────────────────────────
document.getElementById('hist-metric-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.history-metric-tab');
    if (!btn || btn.classList.contains('active')) return;
    document.querySelectorAll('#hist-metric-tabs .history-metric-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMetric = btn.dataset.metric;
    if (currentDate) loadRange(currentPeriod);
});

// ── Period tabs ───────────────────────────────────────────────────────────────
document.getElementById('hist-period-tabs').addEventListener('click', (e) => {
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

    resetStatsBar();

    const singleDay = days === 1;
    // Disable the date picker in multi-day views — it only applies to single day.
    pickerWrapper.classList.toggle('hist-picker-disabled', !singleDay);
    dateInput.disabled = !singleDay;

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

document.getElementById('chart-history-btn').addEventListener('click', openHistModal);
document.getElementById('hist-modal-close').addEventListener('click', closeHistModal);
modal.querySelector('.hist-modal-backdrop').addEventListener('click', closeHistModal);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('open')) closeHistModal();
});
