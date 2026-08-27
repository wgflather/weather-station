// =========================================================
// RAW DATABASE VIEW (Database tab on /admin/config.html)
// A lightweight DB-browser: pages through /api/admin/records,
// filters by data quality / metric / date, deletes single records.
//
// Date pickers are Flatpickr instances with month-level lazy
// loading: when the calendar opens or the user navigates to a new
// month, /api/admin/available-dates?from=&to= is fetched for that
// month and cached. Days with no records render as disabled cells.
// =========================================================

import { createAvailableDates, isoDateKey } from './available-dates.js';

const PAGE_SIZE = 50;

const state = {
    page: 0,
    quality: 'all',
    metric: 'any',
    totalPages: 0,
    loaded: false,
    dateMode: 'date',
    startDate: '',
    endDate: '',
};

const availableDates = createAvailableDates('/api/admin/available-dates');

let singlePicker = null;
let rangePicker = null;

function $(id) {
    return document.getElementById(id);
}

function fmtNum(value, digits) {
    return value === null || value === undefined ? '—' : Number(value).toFixed(digits);
}

function fmtInt(value) {
    return value === null || value === undefined ? '—' : value;
}

function fmtTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}

function metricCell(value, quality, formatted) {
    const q = quality || 'OK';
    return `<td class="db-metric">
        <span class="db-value">${formatted}</span>
        <span class="db-badge db-badge-${q.toLowerCase()}">${q}</span>
    </td>`;
}

function rowHtml(record) {
    return `<tr data-id="${record.id}">
        <td class="db-id">${record.id}</td>
        <td>${record.deviceId ?? '—'}</td>
        <td class="db-time">${fmtTime(record.measuredAt)}</td>
        ${metricCell(record.temperature,   record.temperatureDataQuality,   fmtNum(record.temperature, 1))}
        ${metricCell(record.pressure,      record.pressureDataQuality,      fmtNum(record.pressure, 2))}
        ${metricCell(record.humidity,      record.humidityDataQuality,      fmtNum(record.humidity, 1))}
        ${metricCell(record.surfaceWetness,record.surfaceWetnessDataQuality,fmtInt(record.surfaceWetness))}
        ${metricCell(record.wind,          record.windDataQuality,          fmtNum(record.wind, 1))}
        ${metricCell(record.uvIndex,       record.uvIndexDataQuality,       fmtNum(record.uvIndex, 1))}
        <td><button type="button" class="db-delete-btn" data-id="${record.id}" title="Delete record">Delete</button></td>
    </tr>`;
}

function buildQuery() {
    const params = new URLSearchParams({
        page: String(state.page),
        size: String(PAGE_SIZE),
    });
    if (state.startDate) {
        params.set('startDate', state.startDate);
        if (state.endDate) params.set('endDate', state.endDate);
    }
    if (state.quality === 'all') {
        params.set('all', 'true');
    } else {
        params.set('all', 'false');
        params.set('quality', state.quality);
        if (state.metric !== 'any') params.set('metric', state.metric);
    }
    return params.toString();
}

function syncFilterControls() {
    $('db-metric-filter').disabled = state.quality === 'all';
    $('db-clear-dates').hidden = !state.startDate;
}

function setMeta(message, isError) {
    const el = $('db-meta');
    el.textContent = message;
    el.classList.toggle('error', Boolean(isError));
}

async function loadRecords() {
    const tbody = $('db-tbody');
    const emptyEl = $('db-empty');

    setMeta('Loading…', false);
    try {
        const response = await fetch(`/api/admin/records?${buildQuery()}`);
        if (!response.ok) throw new Error(`Failed to load records (${response.status})`);

        const pageData = await response.json();
        const content = pageData.content || [];
        state.totalPages = pageData.totalPages || 0;
        state.loaded = true;

        tbody.innerHTML = content.map(rowHtml).join('');
        emptyEl.hidden = content.length > 0;

        const total = pageData.totalElements ?? content.length;
        setMeta(`${total} record${total === 1 ? '' : 's'}`, false);
        updatePager(pageData);
    } catch (err) {
        tbody.innerHTML = '';
        emptyEl.hidden = false;
        setMeta(err.message, true);
    }
}

function updatePager(pageData) {
    const info = $('db-page-info');
    const total = state.totalPages || 1;
    info.textContent = `Page ${(pageData.number ?? 0) + 1} of ${total}`;
    $('db-prev').disabled = pageData.first ?? state.page === 0;
    $('db-next').disabled = pageData.last ?? true;
}

// Custom confirm modal — replaces window.confirm() because iOS Safari
// can deadlock the page when confirm() is called from a delegated click
// handler inside a horizontally scrolling container.
function showConfirm(message, { okLabel = 'Delete' } = {}) {
    return new Promise((resolve) => {
        const modal   = $('confirm-modal');
        const msgEl   = $('confirm-message');
        const okBtn   = $('confirm-ok');
        const cancel  = $('confirm-cancel');

        msgEl.textContent = message;
        okBtn.textContent = okLabel;
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        // Move focus off the triggering button so Enter doesn't re-fire it
        okBtn.focus();

        const cleanup = (result) => {
            modal.hidden = true;
            document.body.style.overflow = '';
            okBtn.removeEventListener('click', onOk);
            cancel.removeEventListener('click', onCancel);
            modal.removeEventListener('click', onBackdrop);
            document.removeEventListener('keydown', onKey);
            resolve(result);
        };
        const onOk     = () => cleanup(true);
        const onCancel = () => cleanup(false);
        const onBackdrop = (e) => {
            if (e.target.dataset.confirmDismiss !== undefined) cleanup(false);
        };
        const onKey = (e) => {
            if (e.key === 'Escape') cleanup(false);
            else if (e.key === 'Enter') cleanup(true);
        };

        okBtn.addEventListener('click', onOk);
        cancel.addEventListener('click', onCancel);
        modal.addEventListener('click', onBackdrop);
        document.addEventListener('keydown', onKey);
    });
}

async function deleteRecord(id, rowEl) {
    const ok = await showConfirm(`Delete record #${id}? This cannot be undone.`);
    if (!ok) return;

    const btn = rowEl.querySelector('.db-delete-btn');
    if (btn) btn.disabled = true;

    try {
        const response = await fetch(`/api/admin/records/${id}`, { method: 'DELETE' });
        if (response.ok) {
            rowEl.remove();
            if (!$('db-tbody').children.length) $('db-empty').hidden = false;
        } else if (response.status === 404) {
            setMeta(`Record #${id} no longer exists`, true);
            rowEl.remove();
        } else {
            throw new Error(`Delete failed (${response.status})`);
        }
    } catch (err) {
        if (btn) btn.disabled = false;
        setMeta(err.message, true);
    }
}

// ---------- Flatpickr setup ----------

function initPickers() {
    singlePicker = flatpickr('#db-single-date', {
        ...availableDates.pickerOptions(),
        mode: 'single',
        onChange: (selectedDates) => {
            const val = selectedDates[0] ? isoDateKey(selectedDates[0]) : '';
            state.startDate = val;
            state.endDate = '';
            state.page = 0;
            syncFilterControls();
            loadRecords();
        },
    });

    rangePicker = flatpickr('#db-start-date', {
        ...availableDates.pickerOptions(),
        mode: 'range',
        plugins: [new rangePlugin({ input: '#db-end-date' })],
        onChange: (selectedDates) => {
            // In range mode, Flatpickr fires onChange twice:
            //   1st click  → selectedDates.length === 1 (start chosen)
            //   2nd click  → selectedDates.length === 2 (range complete)
            // We refresh only when the range is complete (or fully cleared).
            if (selectedDates.length === 2) {
                state.startDate = isoDateKey(selectedDates[0]);
                state.endDate   = isoDateKey(selectedDates[1]);
                state.page = 0;
                syncFilterControls();
                loadRecords();
            } else if (selectedDates.length === 0) {
                state.startDate = '';
                state.endDate = '';
                state.page = 0;
                syncFilterControls();
                loadRecords();
            } else {
                // length === 1: start picked, awaiting end. Reflect in state
                // but don't fetch yet.
                state.startDate = isoDateKey(selectedDates[0]);
                state.endDate = '';
                syncFilterControls();
            }
        },
    });
}

function clearPickers() {
    singlePicker?.clear();
    rangePicker?.clear();
}

function switchDateMode(mode) {
    const wasFiltered = Boolean(state.startDate);
    state.dateMode = mode;
    state.startDate = '';
    state.endDate = '';

    clearPickers();

    document.querySelectorAll('.db-mode-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === mode);
    });

    $('db-single-date').hidden = mode !== 'date';
    $('db-range-wrap').hidden = mode !== 'range';

    state.page = 0;
    syncFilterControls();
    if (wasFiltered) loadRecords();
}

// ---------- init ----------

function initDatabaseView() {
    initPickers();

    document.querySelector('.section-tab[data-section="database"]')?.addEventListener('click', () => {
        if (!state.loaded) {
            const now = new Date();
            availableDates.loadMonth(now.getFullYear(), now.getMonth()); // warm the cache
            loadRecords();
        }
    });

    const metricFilter = $('db-metric-filter');

    $('db-quality-filter').addEventListener('change', (e) => {
        state.quality = e.target.value;
        state.page = 0;
        metricFilter.disabled = state.quality === 'all';
        loadRecords();
    });

    metricFilter.addEventListener('change', (e) => {
        state.metric = e.target.value;
        state.page = 0;
        loadRecords();
    });

    $('db-mode-toggle').addEventListener('click', (e) => {
        const btn = e.target.closest('.db-mode-btn');
        if (!btn || btn.classList.contains('active')) return;
        switchDateMode(btn.dataset.mode);
    });

    $('db-clear-dates').addEventListener('click', () => {
        state.startDate = '';
        state.endDate = '';
        clearPickers();
        state.page = 0;
        syncFilterControls();
        loadRecords();
    });

    $('db-refresh').addEventListener('click', () => loadRecords());

    $('db-prev').addEventListener('click', () => {
        if (state.page > 0) {
            state.page -= 1;
            loadRecords();
        }
    });

    $('db-next').addEventListener('click', () => {
        if (state.page < state.totalPages - 1) {
            state.page += 1;
            loadRecords();
        }
    });

    $('db-tbody').addEventListener('click', (e) => {
        const btn = e.target.closest('.db-delete-btn');
        if (!btn) return;
        const row = btn.closest('tr');
        deleteRecord(btn.dataset.id, row);
    });
}

initDatabaseView();
