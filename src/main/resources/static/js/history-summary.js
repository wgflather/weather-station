const block      = document.getElementById('history-summary');
const body       = document.getElementById('history-body');
const toggleBtn  = document.getElementById('history-toggle');
const prevBtn    = document.getElementById('history-prev');
const nextBtn    = document.getElementById('history-next');
const dateBtn    = document.getElementById('history-date-btn');
const dateLabel  = document.getElementById('history-date-label');
const tempPeek   = document.getElementById('history-temp-peek');
const noDataMsg  = document.getElementById('history-no-data');
const metricsEl  = document.getElementById('history-metrics');
const calendar   = document.getElementById('history-calendar');
const calTitle   = document.getElementById('cal-month-label');
const calGrid    = document.getElementById('cal-grid');
const calPrev    = document.getElementById('cal-prev-month');
const calNext    = document.getElementById('cal-next-month');

// ── State ─────────────────────────────────────────────────────────────────────
let currentDate  = yesterday();
let isExpanded   = false;
let calOpen      = false;
let calYear      = 0;
let calMonth     = 0;   // 1-based

// Per-month available-date cache — mirrors the pattern in database-view.js.
// "YYYY-MM" → Set<"YYYY-MM-DD">
const monthCache    = new Map();
const monthInFlight = new Map();

// ── Date helpers ──────────────────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, '0'); }

function yesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function stepDate(dateStr, delta) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d + delta);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function monthKeyFor(dateStr) {
    return dateStr.slice(0, 7);   // "YYYY-MM"
}

function monthBounds(yearMonthKey) {
    const [y, m] = yearMonthKey.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { from: `${yearMonthKey}-01`, to: `${yearMonthKey}-${pad2(lastDay)}` };
}

function formatDateLabel(dateStr) {
    if (dateStr === yesterday()) return 'Yesterday';
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric',
    });
}

function fmt1(v) { return v != null ? Number(v).toFixed(1) : '–'; }

// ── Month lazy-loader (mirrors database-view.js) ──────────────────────────────
async function loadMonth(yearMonthKey) {
    if (monthCache.has(yearMonthKey)) return monthCache.get(yearMonthKey);
    if (monthInFlight.has(yearMonthKey)) return monthInFlight.get(yearMonthKey);

    const { from, to } = monthBounds(yearMonthKey);
    const promise = (async () => {
        try {
            const res = await fetch(`/api/weather/history/available-dates?from=${from}&to=${to}`);
            if (!res.ok) throw new Error(res.status);
            const dates = await res.json();
            const set = new Set(dates);
            monthCache.set(yearMonthKey, set);
            return set;
        } catch {
            const set = new Set();
            monthCache.set(yearMonthKey, set);
            return set;
        } finally {
            monthInFlight.delete(yearMonthKey);
        }
    })();
    monthInFlight.set(yearMonthKey, promise);
    return promise;
}

function isAvailable(dateStr) {
    const key = monthKeyFor(dateStr);
    return monthCache.get(key)?.has(dateStr) ?? false;
}

// Load the months that surround a given date so nav buttons can be determined.
async function ensureAdjacentMonths(dateStr) {
    const key  = monthKeyFor(dateStr);
    const prev = monthKeyFor(stepDate(dateStr, -1));
    const next = monthKeyFor(stepDate(dateStr, 1));
    await Promise.all([key, prev, next].map(loadMonth));
}

async function updateNavButtons() {
    const prevDate = stepDate(currentDate, -1);
    const nextDate = stepDate(currentDate, 1);
    prevBtn.disabled = !isAvailable(prevDate);
    nextBtn.disabled = nextDate >= todayStr() || !isAvailable(nextDate);
}

// ── Summary loading ───────────────────────────────────────────────────────────
async function loadDate(dateStr) {
    currentDate = dateStr;
    dateLabel.textContent = formatDateLabel(dateStr);
    tempPeek.textContent  = '';
    noDataMsg.hidden      = true;
    metricsEl.hidden      = false;

    // Disable both buttons while loading to prevent double-navigation.
    prevBtn.disabled = true;
    nextBtn.disabled = true;

    try {
        const res = await fetch(`/api/weather/history/daily/summary?date=${dateStr}`);
        if (res.status === 404) { showNoData(); }
        else if (!res.ok)       { showNoData(); }
        else                    { populateSummary(await res.json()); }
    } catch {
        showNoData();
    }

    await ensureAdjacentMonths(dateStr);
    await updateNavButtons();
}

function populateSummary(d) {
    const tMin = fmt1(d.temperatureMin), tMax = fmt1(d.temperatureMax);
    document.getElementById('hist-temp-min').textContent = tMin;
    document.getElementById('hist-temp-max').textContent = tMax;
    document.getElementById('hist-temp-avg').textContent = fmt1(d.temperatureAvg);
    document.getElementById('hist-pres-min').textContent = fmt1(d.pressureMin);
    document.getElementById('hist-pres-max').textContent = fmt1(d.pressureMax);
    document.getElementById('hist-pres-avg').textContent = fmt1(d.pressureAvg);
    document.getElementById('hist-hum-min').textContent  = fmt1(d.humidityMin);
    document.getElementById('hist-hum-max').textContent  = fmt1(d.humidityMax);
    document.getElementById('hist-hum-avg').textContent  = fmt1(d.humidityAvg);
    tempPeek.textContent = `${tMin}° – ${tMax}°C`;
    noDataMsg.hidden = true;
    metricsEl.hidden = false;
}

function showNoData() {
    tempPeek.textContent = '';
    noDataMsg.hidden     = false;
    metricsEl.hidden     = true;
}

// ── Expand / collapse ─────────────────────────────────────────────────────────
function setExpanded(expanded) {
    isExpanded = expanded;
    block.classList.toggle('expanded', expanded);
    toggleBtn.setAttribute('aria-expanded', String(expanded));
    body.setAttribute('aria-hidden', String(!expanded));
}

// ── Calendar rendering ────────────────────────────────────────────────────────
async function renderCalendar() {
    const key       = `${calYear}-${pad2(calMonth)}`;
    const available = await loadMonth(key);

    calTitle.textContent = new Date(calYear, calMonth - 1, 1)
        .toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    const today       = todayStr();
    const firstDayOfWeek = (new Date(calYear, calMonth - 1, 1).getDay() + 6) % 7; // Mon-first
    const daysInMonth = new Date(calYear, calMonth, 0).getDate();

    calGrid.innerHTML = '';

    for (let i = 0; i < firstDayOfWeek; i++) {
        const blank = document.createElement('span');
        blank.className = 'cal-day other-month';
        calGrid.appendChild(blank);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${calYear}-${pad2(calMonth)}-${pad2(day)}`;
        const btn = document.createElement('button');
        btn.className = 'cal-day';
        btn.textContent = day;
        btn.type = 'button';

        if (dateStr >= today) {
            btn.disabled = true;
        } else if (available.has(dateStr)) {
            btn.classList.add('available');
            if (dateStr === currentDate) btn.classList.add('selected');
            btn.addEventListener('click', () => {
                closeCalendar();
                if (!isExpanded) setExpanded(true);
                loadDate(dateStr);
            });
        } else {
            btn.disabled = true;
        }
        calGrid.appendChild(btn);
    }

    const thisMonthKey = `${calYear}-${pad2(calMonth)}`;
    const todayMonthKey = today.slice(0, 7);
    calPrev.disabled = false;
    calNext.disabled = thisMonthKey >= todayMonthKey;
}

function positionCalendar() {
    const rect   = dateBtn.getBoundingClientRect();
    const calW   = 260;
    const calH   = calendar.offsetHeight || 280;  // estimate before first paint
    const margin = 8;

    let left = rect.left + rect.width / 2 - calW / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - calW - margin));

    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const top = spaceBelow >= calH
        ? rect.bottom + margin
        : rect.top - calH - margin;

    calendar.style.left = `${left}px`;
    calendar.style.top  = `${Math.max(margin, top)}px`;
}

function openCalendar() {
    const [y, m] = currentDate.split('-').map(Number);
    calYear  = y;
    calMonth = m;
    positionCalendar();
    calendar.classList.add('open');
    calendar.removeAttribute('aria-hidden');
    calOpen = true;
    renderCalendar();
}

function closeCalendar() {
    calendar.classList.remove('open');
    calendar.setAttribute('aria-hidden', 'true');
    calOpen = false;
}

// ── Event listeners ───────────────────────────────────────────────────────────
toggleBtn.addEventListener('click', () => {
    setExpanded(!isExpanded);
    if (isExpanded) loadDate(currentDate);
});

prevBtn.addEventListener('click', () => {
    if (!prevBtn.disabled) loadDate(stepDate(currentDate, -1));
});

nextBtn.addEventListener('click', () => {
    if (!nextBtn.disabled) loadDate(stepDate(currentDate, 1));
});

dateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    calOpen ? closeCalendar() : openCalendar();
});

calPrev.addEventListener('click', () => {
    calMonth--;
    if (calMonth < 1) { calMonth = 12; calYear--; }
    renderCalendar();
});

calNext.addEventListener('click', () => {
    calMonth++;
    if (calMonth > 12) { calMonth = 1; calYear++; }
    renderCalendar();
});

document.addEventListener('click', (e) => {
    if (calOpen && !calendar.contains(e.target) && e.target !== dateBtn) {
        closeCalendar();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && calOpen) closeCalendar();
});

window.addEventListener('resize', () => {
    if (calOpen) positionCalendar();
});

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
    dateLabel.textContent = formatDateLabel(currentDate);
    prevBtn.disabled = true;
    nextBtn.disabled = true;
    // Warm the cache for the current month and the previous month so that
    // nav buttons can be set correctly without waiting for user interaction.
    await ensureAdjacentMonths(currentDate);
    await updateNavButtons();
})();
