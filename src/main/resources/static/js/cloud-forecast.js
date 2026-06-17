// Meteocons animated SVG weather icons, MIT license (https://meteocons.com/)

const METEOCONS_VERSION = '3.0.0-next.10';
const ICON_ANIMATED = `https://cdn.meteocons.com/${METEOCONS_VERSION}/svg/fill/`;
const ICON_STATIC   = `https://cdn.meteocons.com/${METEOCONS_VERSION}/svg-static/fill/`;

const HOURS_PAST  = 3;
const HOURS_AHEAD = 8;

// ==========================================
// ICON SELECTION
// Priority: sleet > snow > rain > drizzle > cloud-only
// ==========================================

// WMO thunderstorm codes from Open-Meteo weather_code:
//   95 — slight/moderate thunderstorm
//   96 — thunderstorm with slight hail
//   99 — thunderstorm with heavy hail
const THUNDER_CODES  = new Set([95]);
const HAIL_CODES     = new Set([96, 99]);

function selectIcon(point, isNight) {
    const cloud  = point.cloudCover          ?? 0;
    const chance = point.precipitationChance ?? 0;
    const rain   = (point.rainAmount ?? 0) + (point.showersAmount ?? 0);
    const snow   = point.snowAmount          ?? 0;
    const wc     = point.weatherCode         ?? 0;

    const n      = isNight ? 'night' : 'day';
    const prefix = cloud >= 60 ? `overcast-${n}` : `partly-cloudy-${n}`;

    // Weather code is the authoritative model signal — check it first.
    // Overcast thunderstorm variants don't exist in this icon set, so the
    // rain variant is used for both overcast and partly-cloudy thunderstorms.
    if (HAIL_CODES.has(wc))   return `${prefix}-hail`;
    if (THUNDER_CODES.has(wc)) {
        if (snow > 0.1) return `thunderstorms-${n}-snow`;
        return `thunderstorms-${n}-rain`;
    }

    if (snow > 0.1 && rain > 0.1) return `${prefix}-sleet`;
    if (snow > 0.1)                return `${prefix}-snow`;
    if (rain > 0.5)                return `${prefix}-rain`;
    if (rain > 0.1 || chance >= 30) return `${prefix}-drizzle`;

    if (cloud < 15) return `clear-${n}`;
    if (cloud < 60) return `partly-cloudy-${n}`;
    return 'overcast';
}

// ==========================================
// TOOLTIP CONTENT
// ==========================================

function cloudCoverLabel(pct) {
    if (pct < 15) return 'Clear';
    if (pct < 40) return 'Partly cloudy';
    if (pct < 70) return 'Mostly cloudy';
    return 'Overcast';
}

function precipLabel(point) {
    const snow = point.snowAmount ?? 0;
    const rain = (point.rainAmount ?? 0) + (point.showersAmount ?? 0);
    if (snow > 0.1 && rain > 0.1) return 'sleet';
    if (snow > 0.1)  return 'snow';
    if (rain > 0.5)  return 'rain';
    if (rain > 0.1)  return 'drizzle';
    return 'precipitation';
}

function buildTooltipHTML(point) {
    const cloud  = point.cloudCover          ?? 0;
    const chance = point.precipitationChance ?? 0;
    const rain   = (point.rainAmount ?? 0) + (point.showersAmount ?? 0);
    const snow   = point.snowAmount          ?? 0;

    let html = `<div class="fc-tip-label">${cloudCoverLabel(cloud)}</div>`;

    if (chance > 0) {
        html += `<div class="fc-tip-row">${Math.round(chance)}% chance of ${precipLabel(point)}</div>`;
    }
    if (rain > 0) {
        html += `<div class="fc-tip-row">${rain.toFixed(1)} mm rain</div>`;
    }
    if (snow > 0.1) {
        html += `<div class="fc-tip-row">${snow.toFixed(1)} cm snow</div>`;
    }
    return html;
}

// ==========================================
// TOOLTIP ELEMENT
// ==========================================

const fcTooltip = (() => {
    const el = document.createElement('div');
    el.className = 'fc-tooltip';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    return el;
})();

let _tooltipSlot = null;

function showTooltip(slotEl, point) {
    fcTooltip.innerHTML = buildTooltipHTML(point);
    fcTooltip.classList.add('visible');
    _tooltipSlot = slotEl;
    positionTooltip(slotEl);
}

function hideTooltip() {
    fcTooltip.classList.remove('visible');
    _tooltipSlot = null;
}

function positionTooltip(slotEl) {
    const r   = slotEl.getBoundingClientRect();
    const tw  = fcTooltip.offsetWidth;
    const th  = fcTooltip.offsetHeight;
    const gap = 8;

    let left = r.left + r.width / 2 - tw / 2;
    let top  = r.top - th - gap;

    // Flip below if not enough room above
    if (top < gap) top = r.bottom + gap;

    // Clamp horizontally
    left = Math.max(gap, Math.min(left, window.innerWidth - tw - gap));

    fcTooltip.style.left = `${Math.round(left)}px`;
    fcTooltip.style.top  = `${Math.round(top)}px`;
}

function initTooltip(strip) {
    // Desktop hover
    strip.addEventListener('mouseenter', e => {
        const slot = e.target.closest('.cloud-slot');
        if (slot?._fcPoint) showTooltip(slot, slot._fcPoint);
    }, true);

    strip.addEventListener('mouseleave', e => {
        if (!e.target.closest('.cloud-slot')) return;
        hideTooltip();
    }, true);

    // Mobile tap — always stop propagation first so that a tap landing on a
    // gap between slots (very common on narrow touch targets) doesn't escape
    // to the document-level "click away" handler and close the tooltip before
    // the slot handler even gets a chance to switch it to the new slot.
    strip.addEventListener('click', e => {
        e.stopPropagation();
        const slot = e.target.closest('.cloud-slot');
        if (!slot?._fcPoint) return;   // gap / day-marker: keep current state
        if (_tooltipSlot === slot) {
            hideTooltip();
        } else {
            showTooltip(slot, slot._fcPoint);
        }
    });

    document.addEventListener('click', () => hideTooltip());
    window.addEventListener('scroll',  () => {
        if (_tooltipSlot) positionTooltip(_tooltipSlot);
    }, { passive: true });
    window.addEventListener('resize',  () => {
        if (_tooltipSlot) positionTooltip(_tooltipSlot);
    });
}

// ==========================================
// MODULE STATE
// ==========================================

let _forecastPoints = null;
let _sunriseMs      = null;
let _sunsetMs       = null;

// Returns true when a given UTC timestamp falls in a night period.
// Uses time-of-day (minutes since midnight in local browser time) rather
// than absolute ms comparison so the logic works correctly for slots that
// span into the next calendar day — e.g. the 8-hour ahead window showing
// next morning shouldn't keep showing moon icons after sunrise.
// Falls back to sunset-only check when only one value is available.
function isNightHour(slotMs) {
    if (_sunriseMs == null && _sunsetMs == null) return false;
    if (_sunriseMs == null) return slotMs >= _sunsetMs;

    const tod = ms => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
    const slot = tod(slotMs);
    const rise = tod(_sunriseMs);
    const set  = tod(_sunsetMs);
    return slot < rise || slot >= set;
}

// ==========================================
// WINDOWING
// ==========================================

function buildWindow(points) {
    const now = Date.now();
    let currentIdx = 0;
    for (let i = 0; i < points.length; i++) {
        if (parseMs(points[i].time) <= now) currentIdx = i;
        else break;
    }
    const start = Math.max(0, currentIdx - HOURS_PAST);
    const end   = Math.min(points.length, currentIdx + HOURS_AHEAD + 1);
    return { window: points.slice(start, end), currentIdx: currentIdx - start };
}

function parseMs(isoTime) {
    // Strip IANA bracket suffix (e.g. "[Europe/Kiev]") that Date() cannot parse.
    return new Date(String(isoTime).replace(/\[.*]$/, '')).getTime();
}

// ==========================================
// RENDER
// ==========================================

function renderCloudStrip(forecastPoints) {
    const strip = document.getElementById('cloud-strip');
    if (!strip || !forecastPoints.length) return;

    const { window: slots, currentIdx } = buildWindow(forecastPoints);

    let html     = '';
    let prevDate = null;

    slots.forEach((point, i) => {
        const slotMs    = parseMs(point.time);
        const slotDate  = new Date(slotMs);
        const hour      = slotDate.getHours();
        const isNight   = isNightHour(slotMs);
        const iconName  = selectIcon(point, isNight);
        const isCurrent = i === currentIdx;
        const src       = (isCurrent ? ICON_ANIMATED : ICON_STATIC) + iconName + '.svg';

        const slotDay = slotDate.toDateString();
        if (prevDate !== null && prevDate !== slotDay) {
            const label = slotDate.toLocaleDateString('en-GB', { weekday: 'short' });
            html += `<div class="cloud-day-marker" aria-hidden="true">
                <div class="cloud-day-line"></div>
                <span class="cloud-day-label">${label}</span>
            </div>`;
        }
        prevDate = slotDay;

        const cls   = i < currentIdx ? 'past' : isCurrent ? 'current' : 'future';
        const label = String(hour).padStart(2, '0');

        html += `<div class="cloud-slot ${cls}" data-hour="${hour}">
            <img src="${src}" alt="${iconName}" width="34" height="34" loading="lazy">
            <span class="cloud-slot-hour">${label}</span>
        </div>`;
    });

    strip.innerHTML = html;

    // Attach point data to each slot element for the tooltip handler.
    strip.querySelectorAll('.cloud-slot').forEach((el, i) => {
        el._fcPoint = slots[i];
    });

    scrollToCurrentHour(strip);
}

function scrollToCurrentHour(strip) {
    const current = strip.querySelector('.cloud-slot.current');
    if (!current) return;
    strip.scrollLeft = current.offsetLeft - strip.clientWidth / 2 + current.offsetWidth / 2;
}

// ==========================================
// PUBLIC — called by fetch-data.js after astronomy loads
// ==========================================

// Receives both sunrise and sunset so the night check can correctly bracket
// both ends of the day, including next-morning slots in the forecast window.
window.refreshCloudSunTimes = function (riseIso, setIso) {
    const riseMs = riseIso ? parseMs(riseIso) : NaN;
    const setMs  = setIso  ? parseMs(setIso)  : NaN;
    let changed  = false;
    if (!isNaN(riseMs) && riseMs !== _sunriseMs) { _sunriseMs = riseMs; changed = true; }
    if (!isNaN(setMs)  && setMs  !== _sunsetMs)  { _sunsetMs  = setMs;  changed = true; }
    if (changed && _forecastPoints) renderCloudStrip(_forecastPoints);
};

// ==========================================
// FETCH
// ==========================================

async function loadCloudForecast() {
    try {
        const res = await fetch('/api/forecast/clouds');
        if (!res.ok) return;
        const data = await res.json();
        _forecastPoints = data.forecastPoints ?? [];
        renderCloudStrip(_forecastPoints);
        const strip = document.getElementById('cloud-strip');
        if (strip) initTooltip(strip);
    } catch (e) {
        console.error('Cloud forecast fetch failed:', e);
    }
}

loadCloudForecast();

// Returns the cloud cover % (0–100) for the current hour, or null if forecast
// data hasn't loaded yet. Called by star-field.js as a cloud-cover multiplier.
window.getCurrentCloudCover = function () {
    if (!_forecastPoints?.length) return null;
    const now = Date.now();
    let best = _forecastPoints[0];
    for (const p of _forecastPoints) {
        if (parseMs(p.time) <= now) best = p;
        else break;
    }
    return best?.cloudCover ?? null;
};
