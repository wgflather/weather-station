import { renderWeatherChart } from './weather-chart.js';

/* =========================================================
   HISTORY PAGE
   Standalone page for browsing daily weather summaries and
   per-metric charts. Supports 1 / 7 / 14 / 30 day views.
========================================================= */

// ── State ─────────────────────────────────────────────────────────────────────
let currentDate   = null;
let currentMetric = 'temperature';
let currentPeriod = 1;  // 1 | 7 | 14 | 30

const monthCache    = new Map();
const monthInFlight = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, '0'); }

function yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function subtractDays(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d - days);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function fmt1(v) { return v != null ? Number(v).toFixed(1) : '–'; }

function formatPageTitle(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
}

function formatDateRange(fromStr, toStr) {
    const [fy, fm, fd] = fromStr.split('-').map(Number);
    const [ty, tm, td] = toStr.split('-').map(Number);
    const from = new Date(fy, fm - 1, fd).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const to   = new Date(ty, tm - 1, td).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return `${from} – ${to}`;
}

// ── Available dates ───────────────────────────────────────────────────────────
async function loadMonth(year, month) {
    const key = `${year}-${pad2(month + 1)}`;
    if (monthCache.has(key)) return monthCache.get(key);
    if (monthInFlight.has(key)) return monthInFlight.get(key);

    const firstDay = `${year}-${pad2(month + 1)}-01`;
    const lastDay  = new Date(year, month + 1, 0).getDate();
    const lastDate = `${year}-${pad2(month + 1)}-${pad2(lastDay)}`;

    const promise = (async () => {
        try {
            const res = await fetch(`/api/weather/history/available-dates?from=${firstDay}&to=${lastDate}`);
            if (!res.ok) throw new Error(res.status);
            const dates = await res.json();
            const set = new Set(dates);
            monthCache.set(key, set);
            return set;
        } catch {
            const set = new Set();
            monthCache.set(key, set);
            return set;
        } finally {
            monthInFlight.delete(key);
        }
    })();
    monthInFlight.set(key, promise);
    return promise;
}

function isDateEnabled(date) {
    const key = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
    return monthCache.get(key)?.has(
        `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    ) ?? false;
}

async function ensureMonthsLoaded(instance) {
    const months = instance.config.showMonths || 1;
    const promises = [];
    for (let i = 0; i < months; i++) {
        let year = instance.currentYear;
        let month = instance.currentMonth + i;
        while (month > 11) { month -= 12; year += 1; }
        promises.push(loadMonth(year, month));
    }
    await Promise.all(promises);
    instance.redraw();
}

// ── Date picker ───────────────────────────────────────────────────────────────
async function initDatePicker() {
    const [y, m] = currentDate.split('-').map(Number);
    await loadMonth(y, m - 1);

    flatpickr(document.getElementById('hist-date-input'), {
        dateFormat:    'Y-m-d',
        maxDate:       'today',
        disableMobile: true,
        defaultDate:   currentDate,
        enable:        [isDateEnabled],
        onOpen:        (_s, _str, instance) => ensureMonthsLoaded(instance),
        onMonthChange: (_s, _str, instance) => ensureMonthsLoaded(instance),
        onYearChange:  (_s, _str, instance) => ensureMonthsLoaded(instance),
        onChange: (selectedDates) => {
            if (!selectedDates[0]) return;
            const d = selectedDates[0];
            const dateStr = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
            if (dateStr !== currentDate) {
                currentDate = dateStr;
                history.replaceState(null, '', `?date=${dateStr}`);
                loadRange(currentPeriod);
            }
        },
    });
}

// ── Single-day summary ────────────────────────────────────────────────────────
async function loadDaySummary(dateStr) {
    const titleEl   = document.getElementById('hist-summary-title');
    const noData    = document.getElementById('hist-no-data');
    const statsGrid = document.getElementById('hist-stats-grid');

    titleEl.textContent = formatPageTitle(dateStr);
    noData.hidden   = true;
    statsGrid.hidden = false;

    try {
        const res = await fetch(`/api/weather/history/daily/summary?date=${dateStr}`);
        if (res.status === 404) { showSummaryNoData(noData, statsGrid, 'No data for this day'); return; }
        if (!res.ok) throw new Error(res.status);
        const d = await res.json();

        document.getElementById('hist-temp-min').textContent = `${fmt1(d.temperatureMin)}°C`;
        document.getElementById('hist-temp-max').textContent = `${fmt1(d.temperatureMax)}°C`;
        document.getElementById('hist-temp-avg').textContent = `${fmt1(d.temperatureAvg)}°C`;
        document.getElementById('hist-pres-min').textContent = `${fmt1(d.pressureMin)} hPa`;
        document.getElementById('hist-pres-max').textContent = `${fmt1(d.pressureMax)} hPa`;
        document.getElementById('hist-pres-avg').textContent = `${fmt1(d.pressureAvg)} hPa`;
        document.getElementById('hist-hum-min').textContent  = `${fmt1(d.humidityMin)}%`;
        document.getElementById('hist-hum-max').textContent  = `${fmt1(d.humidityMax)}%`;
        document.getElementById('hist-hum-avg').textContent  = `${fmt1(d.humidityAvg)}%`;
    } catch {
        showSummaryNoData(noData, statsGrid, 'No data for this day');
    }
}

// ── Multi-day summary ─────────────────────────────────────────────────────────
async function loadMultiDaySummary(fromStr, toStr, days) {
    const titleEl   = document.getElementById('hist-summary-title');
    const noData    = document.getElementById('hist-no-data');
    const statsGrid = document.getElementById('hist-stats-grid');

    titleEl.textContent = `${formatDateRange(fromStr, toStr)} (${days} days)`;
    noData.hidden   = true;
    statsGrid.hidden = false;

    try {
        const res = await fetch(`/api/weather/history/daily?from=${fromStr}&to=${toStr}`);
        if (!res.ok) throw new Error(res.status);
        const records = await res.json();
        if (!records.length) { showSummaryNoData(noData, statsGrid, 'No data for this period'); return; }

        let tempMin = Infinity, tempMax = -Infinity, tempAvgSum = 0, tempAvgCount = 0;
        let presMin = Infinity, presMax = -Infinity, presAvgSum = 0, presAvgCount = 0;
        let humMin  = Infinity, humMax  = -Infinity, humAvgSum  = 0, humAvgCount  = 0;

        for (const r of records) {
            if (r.temperatureMin != null) tempMin = Math.min(tempMin, r.temperatureMin);
            if (r.temperatureMax != null) tempMax = Math.max(tempMax, r.temperatureMax);
            if (r.temperatureAvg != null) { tempAvgSum += r.temperatureAvg; tempAvgCount++; }
            if (r.pressureMin != null) presMin = Math.min(presMin, r.pressureMin);
            if (r.pressureMax != null) presMax = Math.max(presMax, r.pressureMax);
            if (r.pressureAvg != null) { presAvgSum += r.pressureAvg; presAvgCount++; }
            if (r.humidityMin != null) humMin = Math.min(humMin, r.humidityMin);
            if (r.humidityMax != null) humMax = Math.max(humMax, r.humidityMax);
            if (r.humidityAvg != null) { humAvgSum += r.humidityAvg; humAvgCount++; }
        }

        const safe = (v, sentinel) => (v === sentinel ? null : v);

        document.getElementById('hist-temp-min').textContent = `${fmt1(safe(tempMin, Infinity))}°C`;
        document.getElementById('hist-temp-max').textContent = `${fmt1(safe(tempMax, -Infinity))}°C`;
        document.getElementById('hist-temp-avg').textContent = `${fmt1(tempAvgCount ? tempAvgSum / tempAvgCount : null)}°C`;
        document.getElementById('hist-pres-min').textContent = `${fmt1(safe(presMin, Infinity))} hPa`;
        document.getElementById('hist-pres-max').textContent = `${fmt1(safe(presMax, -Infinity))} hPa`;
        document.getElementById('hist-pres-avg').textContent = `${fmt1(presAvgCount ? presAvgSum / presAvgCount : null)} hPa`;
        document.getElementById('hist-hum-min').textContent  = `${fmt1(safe(humMin, Infinity))}%`;
        document.getElementById('hist-hum-max').textContent  = `${fmt1(safe(humMax, -Infinity))}%`;
        document.getElementById('hist-hum-avg').textContent  = `${fmt1(humAvgCount ? humAvgSum / humAvgCount : null)}%`;
    } catch {
        showSummaryNoData(noData, statsGrid, 'No data for this period');
    }
}

function showSummaryNoData(noData, statsGrid, message) {
    noData.textContent = message ?? 'No data for this day';
    noData.hidden   = false;
    statsGrid.hidden = true;
}

// ── Single-day chart ──────────────────────────────────────────────────────────
async function loadDayChart(dateStr, metric) {
    const emptyEl = document.getElementById('hist-chart-empty');
    const canvas  = document.getElementById('weatherChart');

    try {
        const res = await fetch(`/api/weather/history/chart/day?date=${dateStr}&metric=${metric}`);
        if (!res.ok) throw new Error(res.status);
        const dto = await res.json();
        const points = (dto.chartPoints || []).map(p => ({ hour: p.hour, hourlyValue: p.hourlyValue }));

        if (points.length === 0) {
            canvas.hidden  = true;
            emptyEl.hidden = false;
            renderWeatherChart([], metric, 60, { canvasId: 'weatherChart', showNow: false });
        } else {
            canvas.hidden  = false;
            emptyEl.hidden = true;
            const [y, m, d] = dateStr.split('-').map(Number);
            renderWeatherChart(points, metric, 60, {
                canvasId: 'weatherChart',
                showNow:  false,
                refDate:  new Date(y, m - 1, d),
            });
        }
    } catch {
        canvas.hidden  = true;
        emptyEl.hidden = false;
    }
}

// ── Multi-day chart ───────────────────────────────────────────────────────────
async function loadMultiDayChart(fromStr, toStr, metric) {
    const emptyEl = document.getElementById('hist-chart-empty');
    const canvas  = document.getElementById('weatherChart');

    try {
        const res = await fetch(`/api/weather/history/chart/daily?from=${fromStr}&to=${toStr}&metric=${metric}`);
        if (!res.ok) throw new Error(res.status);
        const dto = await res.json();
        const points = (dto.chartPoints || []).map(p => ({ hour: p.hour, hourlyValue: p.hourlyValue }));

        const xFrom = new Date(fromStr + 'T00:00:00');
        xFrom.setHours(0, 0, 0, 0);
        const xTo = new Date(toStr + 'T00:00:00');
        xTo.setHours(23, 59, 59, 999);

        if (points.length === 0) {
            canvas.hidden  = true;
            emptyEl.hidden = false;
        } else {
            canvas.hidden  = false;
            emptyEl.hidden = true;
            renderWeatherChart(points, metric, 1440, {
                canvasId: 'weatherChart',
                showNow:  false,
                xUnit:    'day',
                xRange:   { from: xFrom, to: xTo },
            });
        }
    } catch {
        canvas.hidden  = true;
        emptyEl.hidden = false;
    }
}

// ── Metric tabs ───────────────────────────────────────────────────────────────
document.getElementById('hist-metric-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.history-metric-tab');
    if (!btn || btn.classList.contains('active')) return;
    document.querySelectorAll('.history-metric-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMetric = btn.dataset.metric;
    if (currentDate) loadRange(currentPeriod);
});

// ── Period tabs ───────────────────────────────────────────────────────────────
document.getElementById('hist-period-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.history-period-btn');
    if (!btn || btn.classList.contains('active')) return;
    document.querySelectorAll('.history-period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = Number(btn.dataset.days);
    if (currentDate) loadRange(currentPeriod);
});

// ── Load a range (dispatches to single-day or multi-day) ─────────────────────
async function loadRange(days) {
    const chartTitle   = document.getElementById('hist-chart-title');
    const pickerWrapper = document.getElementById('hist-picker-wrapper');

    if (days === 1) {
        pickerWrapper.hidden = false;
        chartTitle.textContent = 'Hourly';
        await Promise.all([
            loadDaySummary(currentDate),
            loadDayChart(currentDate, currentMetric),
        ]);
    } else {
        pickerWrapper.hidden = true;
        chartTitle.textContent = 'Daily';
        const toDate   = yesterday();
        const fromDate = subtractDays(toDate, days - 1);
        await Promise.all([
            loadMultiDaySummary(fromDate, toDate, days),
            loadMultiDayChart(fromDate, toDate, currentMetric),
        ]);
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
    const params = new URLSearchParams(window.location.search);
    const raw    = params.get('date');
    currentDate  = (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) ? raw : yesterday();

    await initDatePicker();
    await loadRange(currentPeriod);
})();
