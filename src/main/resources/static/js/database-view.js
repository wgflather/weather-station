// =========================================================
// RAW DATABASE VIEW (Database tab on /admin/config.html)
// A lightweight DB-browser: pages through /api/admin/records,
// filters by data quality, and deletes single records.
// =========================================================

const PAGE_SIZE = 50;

const state = {
    page: 0,
    quality: 'all',
    metric: 'any',
    totalPages: 0,
    loaded: false,
};

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

// Renders a value cell with a small quality badge underneath.
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
        ${metricCell(record.temperature, record.temperatureDataQuality, fmtNum(record.temperature, 1))}
        ${metricCell(record.pressure, record.pressureDataQuality, fmtNum(record.pressure, 2))}
        ${metricCell(record.humidity, record.humidityDataQuality, fmtNum(record.humidity, 1))}
        ${metricCell(record.surfaceWetness, record.surfaceWetnessDataQuality, fmtInt(record.surfaceWetness))}
        <td><button type="button" class="db-delete-btn" data-id="${record.id}" title="Delete record">Delete</button></td>
    </tr>`;
}

function buildQuery() {
    const params = new URLSearchParams({
        page: String(state.page),
        size: String(PAGE_SIZE),
    });
    if (state.quality === 'all') {
        params.set('all', 'true');
    } else {
        params.set('all', 'false');
        params.set('quality', state.quality);
        // A specific metric narrows the quality filter to that metric's column;
        // "any" leaves the backend matching the quality across all metrics.
        if (state.metric !== 'any') params.set('metric', state.metric);
    }
    return params.toString();
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

async function deleteRecord(id, rowEl) {
    if (!window.confirm(`Delete record #${id}? This cannot be undone.`)) return;

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

function initDatabaseView() {
    // Lazy-load the first page the first time the Database section is opened.
    document.querySelector('.section-tab[data-section="database"]')?.addEventListener('click', () => {
        if (!state.loaded) loadRecords();
    });

    const metricFilter = $('db-metric-filter');

    $('db-quality-filter').addEventListener('change', (e) => {
        state.quality = e.target.value;
        state.page = 0;
        // The metric filter only applies on top of a specific quality.
        metricFilter.disabled = state.quality === 'all';
        loadRecords();
    });

    metricFilter.addEventListener('change', (e) => {
        state.metric = e.target.value;
        state.page = 0;
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

    // Event delegation for the per-row delete buttons.
    $('db-tbody').addEventListener('click', (e) => {
        const btn = e.target.closest('.db-delete-btn');
        if (!btn) return;
        const row = btn.closest('tr');
        deleteRecord(btn.dataset.id, row);
    });
}

initDatabaseView();
