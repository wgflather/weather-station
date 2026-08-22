// metric-popovers.js
//
// The popovers opened from a metric card's status circle, the dew-point badge
// and the surface-wetness badge, plus the status circle's own colour — all of
// which hang off the single #global-popup element.
//
// Extracted from fetch-data.js. The one cross-cutting rule this module owns is
// that only one popover may be open at a time; closeAllPopovers is exported so
// the station-health and background-preference popovers (still in fetch-data)
// can participate.

import { qualityStripSlot, hydrateQualityStrip } from './quality-strip.js';
import {
    DATA_QUALITY_COLORS,
    DATA_STATUS_COLORS,
    DATA_STATUS_INFO,
    DEW_POINT_RISK_INFO,
    SURFACE_WETNESS_CONFIG,
    QUALITY_SEVERITY,
    STATUS_SEVERITY,
} from './dashboard-constants.js';

const globalPopup = document.getElementById('global-popup');

// Only one popover (metric details, station health, background picker)
// should ever be open at once. Each trigger stops click propagation before
// toggling itself, so the "close on outside click" listeners the others set
// up never fire between them — this is the shared step that actually closes
// the rest before a new one opens. `except` is 'metric' | 'health' | 'bgpref'.
export function closeAllPopovers(except) {
    if (except !== 'metric' && globalPopup.classList.contains('open')) {
        globalPopup.classList.remove('open');
    }
    if (except !== 'health') closePopoverEl('health-popover', 'health-dot-btn');
    if (except !== 'bgpref') closePopoverEl('bg-pref-popover', 'bg-pref-btn');
}

function closePopoverEl(popoverId, btnId) {
    const popover = document.getElementById(popoverId);
    const btn     = document.getElementById(btnId);
    if (popover?.classList.contains('open')) {
        popover.classList.remove('open');
        btn?.setAttribute('aria-expanded', 'false');
        popover.setAttribute('aria-hidden', 'true');
    }
}

export function populatePopup(cardId, details, dataStatus) {
    const card = document.getElementById(cardId);
    if (!card || !details) return;
    card._popupDetails = details;
    card._dataStatus   = dataStatus ?? null;
}

function formatTimeSince(isoString) {
    if (!isoString) return null;
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return null;
    const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
    if (minutes < 1)   return 'less than a minute';
    if (minutes === 1) return '1 minute';
    if (minutes < 60)  return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    if (hours === 1)   return '1 hour';
    if (hours < 24)    return `${hours} hours`;
    const days = Math.floor(hours / 24);
    return `${days} day${days > 1 ? 's' : ''}`;
}

function formatArrivedAt(value) {
    return value ?? '--';
}

// `cardId` is only used to locate this metric's slice of the shared quality
// payload; it is optional so the other popup builders can keep calling this
// without one.
function buildPopupHTML(details, dataStatus, cardId) {
    if (details.dataProvider === 'EXTERNAL_API') {
        // API-backed cards are independent of MQTT sensor freshness — see
        // buildApiPopupHTML. Open-Meteo values never pass through
        // DataQualityValidator either, so there is no quality history to show.
        return buildApiPopupHTML(details);
    }

    const qColor    = DATA_QUALITY_COLORS[details.quality] ?? DATA_QUALITY_COLORS.MISSING;
    const dsColor   = DATA_STATUS_COLORS[dataStatus] ?? '#6b7280';
    const dsInfo    = DATA_STATUS_INFO[dataStatus];
    const timeSince = formatTimeSince(details.arrivedAt);

    const freshnessSection = (dataStatus && dataStatus !== 'LIVE') ? `
        <div class="popup-divider"></div>
        <div class="popup-heading" style="margin-top:8px;">Data Freshness</div>
        <div class="popup-row">
            <span class="popup-key">Status</span>
            <span class="popup-val" style="color:${dsColor}; font-weight:700;">${dsInfo?.label ?? dataStatus}</span>
        </div>
        ${timeSince ? `
        <div class="popup-row">
            <span class="popup-key">Not updated for</span>
            <span class="popup-val">${timeSince}</span>
        </div>` : ''}
        <div class="popup-row" style="flex-direction:column; align-items:flex-start; gap:3px;">
            <span class="popup-key">Note</span>
            <span class="popup-val" style="text-align:left; line-height:1.5; font-weight:400;">${dsInfo?.description ?? ''}</span>
        </div>
    ` : '';

    return `
        <div class="popup-heading">${details.metricName ?? '--'} — Last Measurement</div>
        <div class="popup-row">
            <span class="popup-key">Sensor</span>
            <span class="popup-val">${details.sensor ?? '--'}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Last value</span>
            <span class="popup-val">${details.lastValue ?? '--'}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Quality</span>
            <span class="popup-val" style="color:${qColor}; font-weight:600;">${details.quality ?? '--'}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Arrived</span>
            <span class="popup-val">${formatArrivedAt(details.arrivedAt)}</span>
        </div>
        ${freshnessSection}
        ${qualityStripSlot(cardId)}
    `;
}

// API-backed cards have their own freshness story (the forecast's own
// timestamp), which has nothing to do with MQTT sensor lag — deliberately
// does not take a sensor `dataStatus` and never shows the DELAYED/STALE/
// OFFLINE badge those thresholds were built for.
function buildApiPopupHTML(details) {
    const timeSince = formatTimeSince(details.arrivedAt);

    return `
        <div class="popup-heading">${details.metricName ?? '--'}</div>
        <div class="popup-row">
            <span class="popup-key">Source</span>
            <span class="popup-val" style="color:#60a5fa; font-weight:600;">Open-Meteo API</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Forecast updated</span>
            <span class="popup-val">${formatArrivedAt(details.arrivedAt)}</span>
        </div>
        ${timeSince ? `
        <div class="popup-row">
            <span class="popup-key">Data age</span>
            <span class="popup-val">${timeSince}</span>
        </div>` : ''}
    `;
}

function buildDewRiskPopupHTML(risk, isMixed = false) {
    const info = DEW_POINT_RISK_INFO[risk];
    if (!info) return '';

    const surfacesList = info.surfaces.length
        ? `<div class="popup-row" style="flex-direction:column; align-items:flex-start; gap:4px;">
               <span class="popup-key">At-risk surfaces</span>
               <span class="popup-val" style="text-align:left; line-height:1.6">
                   ${info.surfaces.join(' · ')}
               </span>
           </div>`
        : '';

    const mixedNote = isMixed ? `
        <div class="popup-divider"></div>
        <div class="popup-row" style="flex-direction:column; align-items:flex-start; gap:3px;">
            <span class="popup-key" style="color:#facc15;">⚠ Approximate</span>
            <span class="popup-val" style="text-align:left; line-height:1.5; font-weight:400; color:rgba(250,204,21,0.8);">Temperature and humidity come from different sources — dew point may be slightly inaccurate.</span>
        </div>` : '';

    return `
        <div class="popup-heading">${info.title}</div>
        <div class="popup-row" style="flex-direction:column; align-items:flex-start; gap:4px;">
            <span class="popup-key">What this means</span>
            <span class="popup-val" style="text-align:left; line-height:1.6">${info.explanation}</span>
        </div>
        ${surfacesList}
        <div class="popup-row" style="flex-direction:column; align-items:flex-start; gap:4px; margin-top:4px;">
            <span class="popup-key" style="color:#38bdf8">Tip</span>
            <span class="popup-val" style="text-align:left; line-height:1.6; color:#38bdf8">${info.tip}</span>
        </div>
        ${mixedNote}
    `;
}

export function setStatusCircleColor(circleEl, quality, dataStatus, dataProvider) {
    if (!circleEl) return;

    if (dataProvider === 'EXTERNAL_API') {
        // API-backed cards are independent of MQTT sensor freshness: the
        // sensor going STALE/OFFLINE says nothing about whether Open-Meteo
        // data is current, so `dataStatus` (sensor lag) never reaches here.
        // Always the flat "fresh API source" blue; never pulses, since the
        // data is polled on a fixed schedule, not a live sensor stream.
        const color = '#60a5fa';
        circleEl.style.backgroundColor = color;
        circleEl.style.boxShadow       = `0 0 0 2px ${color}33`;
        circleEl.classList.remove('pulsing');
        return;
    }

    const qSev  = QUALITY_SEVERITY[quality]   ?? 0;
    const dSev  = STATUS_SEVERITY[dataStatus] ?? 0;
    const color = (dSev >= qSev)
        ? (DATA_STATUS_COLORS[dataStatus]  ?? DATA_QUALITY_COLORS.MISSING)
        : (DATA_QUALITY_COLORS[quality]    ?? DATA_QUALITY_COLORS.MISSING);

    circleEl.style.backgroundColor = color;
    circleEl.style.boxShadow       = `0 0 0 2px ${color}33`;
    circleEl.classList.toggle('pulsing', quality === 'OK' && (!dataStatus || dataStatus === 'LIVE'));
}
function positionPopup(anchor) {
    const r      = anchor.getBoundingClientRect();
    const popupW = globalPopup.offsetWidth  || 220;
    const popupH = globalPopup.offsetHeight || 140;
    const margin = 8;
    const vw     = window.innerWidth;
    const vh     = window.innerHeight;

    let top  = r.bottom + margin;
    let left = r.right  - popupW;

    if (left < margin)               left = margin;
    if (left + popupW > vw - margin) left = vw - popupW - margin;
    if (top  + popupH > vh - margin) top  = r.top - popupH - margin;
    if (top  < margin)               top  = margin;

    globalPopup.style.top  = `${Math.round(top)}px`;
    globalPopup.style.left = `${Math.round(left)}px`;
}

function openPopup(html, anchor) {
    closeAllPopovers('metric');
    globalPopup.innerHTML   = html;
    globalPopup._sourceEl   = anchor;
    globalPopup.classList.add('open');
    requestAnimationFrame(() => positionPopup(anchor));
}

function initStatusCircles() {
    document.querySelectorAll('.status-circle').forEach(circle => {
        circle.addEventListener('click', (e) => {
            e.stopPropagation();
            const card       = circle.closest('[id$="-card"]');
            const details    = card?._popupDetails;
            const dataStatus = card?._dataStatus;
            const isOpen     = globalPopup.classList.contains('open')
                            && globalPopup._sourceEl === circle;

            globalPopup.classList.remove('open');
            if (!isOpen && details) {
                openPopup(buildPopupHTML(details, dataStatus, card?.id), circle);
                // Fills asynchronously — usually straight from cache. It makes
                // the popup taller, so reposition once it lands or a popover
                // that flipped above its anchor will overflow the viewport.
                hydrateQualityStrip(globalPopup, () => positionPopup(circle));
            }
        });
    });
}

function initDewRiskBadge() {
    const badgeEl = document.getElementById('dew-status');
    if (!badgeEl) return;

    badgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const risk   = badgeEl._dewRisk;
        const isOpen = globalPopup.classList.contains('open')
                    && globalPopup._sourceEl === badgeEl;

        globalPopup.classList.remove('open');
        if (!isOpen && risk) openPopup(buildDewRiskPopupHTML(risk, badgeEl._dewMixed), badgeEl);
    });
}

function buildWetnessPopupHTML(wetness) {
    const status  = wetness?.surfaceWetnessStatus;
    const details = wetness?.dataDetails;
    const config  = SURFACE_WETNESS_CONFIG[status] ?? SURFACE_WETNESS_CONFIG.DRY;
    const qColor  = DATA_QUALITY_COLORS[details?.quality] ?? DATA_QUALITY_COLORS.MISSING;
    const pct     = wetness?.value != null ? wetness.value.toFixed(1) + '%' : '--';

    return `
        <div class="popup-heading">Surface Wetness</div>
        <div class="popup-row">
            <span class="popup-key">Reading</span>
            <span class="popup-val" style="color:${config.barColor}; font-weight:700;">${pct}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Status</span>
            <span class="popup-val">${config.label}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Quality</span>
            <span class="popup-val" style="color:${qColor}; font-weight:600;">${details?.quality ?? '--'}</span>
        </div>
        <div class="popup-row">
            <span class="popup-key">Measured</span>
            <span class="popup-val">${formatArrivedAt(details?.arrivedAt)}</span>
        </div>
    `;
}

function initWetnessBadge() {
    const badgeEl = document.getElementById('wetness-badge');
    if (!badgeEl) return;

    badgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const wetness = badgeEl._wetnessData;
        const isOpen  = globalPopup.classList.contains('open')
                     && globalPopup._sourceEl === badgeEl;

        globalPopup.classList.remove('open');
        if (!isOpen && wetness) openPopup(buildWetnessPopupHTML(wetness), badgeEl);
    });
}

// ---- global popover behaviour --------------------------------------------

// Any click anywhere dismisses the metric popover. Triggers survive by calling
// stopPropagation() before toggling; anything interactive *inside* the popover
// must do the same (see the quality strip's scrub handler).
document.addEventListener('click', () => globalPopup.classList.remove('open'));

// The popover is position:fixed against a live anchor rect, so it has to be
// re-solved whenever the anchor moves under it.
window.addEventListener('scroll', () => {
    if (globalPopup.classList.contains('open') && globalPopup._sourceEl) {
        positionPopup(globalPopup._sourceEl);
    }
}, { passive: true });

window.addEventListener('resize', () => {
    if (globalPopup.classList.contains('open') && globalPopup._sourceEl) {
        positionPopup(globalPopup._sourceEl);
    }
});

/** Binds the status circles and the dew / wetness badges. */
export function initMetricPopovers() {
    initStatusCircles();
    initDewRiskBadge();
    initWetnessBadge();
}
