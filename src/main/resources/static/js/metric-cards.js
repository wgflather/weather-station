// metric-cards.js
//
// The five sensor metric cards on the dashboard — temperature, pressure,
// humidity (with dew point and the surface-wetness badge), wind and UV — plus
// the "~ stale" hints that sit beside their values.
//
// Pure presentation: renderMetrics() takes the live dashboard DTO and writes
// it into the DOM. It holds no state and never fetches; fetch-data.js polls
// and calls in.
//
// Two contracts worth knowing before editing:
//
//  - Ordering. renderDewPointStatus() reads the temperature back out of
//    #avg-temp rather than taking it as an argument, so renderTemperature()
//    must run before renderHumidity(). renderMetrics() keeps that order.
//  - DOM-stashed payloads. The dew and wetness badges hang their source data
//    on the element (`_dewRisk`, `_dewMixed`, `_wetnessData`); metric-popovers.js
//    reads those back when the badge is clicked. Renaming them here silently
//    breaks the popovers.

import {
    PRESSURE_TREND_CONFIG,
    DEW_POINT_RISK_CONFIG,
    SURFACE_WETNESS_CONFIG,
    UV_CSS,
} from './dashboard-constants.js';
import { populatePopup, setStatusCircleColor } from './metric-popovers.js';

// ==========================================
// TEMPERATURE
// ==========================================

function renderTemperature(temp) {
    if (!temp) return;
    document.getElementById('avg-temp').textContent = temp.value ?? '--';
    document.getElementById('min-temp').textContent = temp.min   ?? '--';
    document.getElementById('max-temp').textContent = temp.max   ?? '--';
    renderTemperatureTrend(temp.trendResult);
}

function renderTemperatureTrend(trendResult) {
    const el = document.getElementById('temp-trend');
    if (!el) return;

    const direction   = trendResult?.direction;
    const changeValue = trendResult?.changeValue ?? 0;

    el.className = '';

    if (direction === 'UP') {
        el.classList.add('trend-up');
        el.innerHTML = `
            <span class="trend-arrow">↑</span>
            <span class="trend-val">${Math.abs(changeValue).toFixed(1)}/h</span>
        `;
    } else if (direction === 'DOWN') {
        el.classList.add('trend-down');
        el.innerHTML = `
            <span class="trend-arrow">↓</span>
            <span class="trend-val">${Math.abs(changeValue).toFixed(1)}/h</span>
        `;
    } else {
        el.classList.add('trend-stable');
        el.innerHTML = `<span class="trend-arrow">→</span>`;
    }
}

// ==========================================
// PRESSURE
// ==========================================

function renderPressure(pressure) {
    if (!pressure) return;
    document.getElementById('avg-pressure').textContent = pressure.value ?? '--';
    renderPressureTrend(pressure.pressureTrend, pressure.trendResult?.changeValue);
}

function renderPressureTrend(pressureTrend, changeValue) {
    const el = document.getElementById('pressure-trend');
    if (!el) return;

    const config   = PRESSURE_TREND_CONFIG[pressureTrend] ?? PRESSURE_TREND_CONFIG.STABLE;
    const isStable = pressureTrend === 'STABLE' || !pressureTrend;
    const absVal   = Math.abs(changeValue ?? 0);
    const valStr   = !isStable && absVal > 0
        ? `<span class="trend-val">${absVal.toFixed(1)}/h</span>`
        : '';

    el.className   = '';
    el.style.color = config.color;

    el.innerHTML = `
        <span class="pressure-trend-indicator" style="color: ${config.color}">
            ${!isStable ? `<span class="trend-arrow">${config.arrow}</span>` : ''}
            ${valStr}
        </span>
        <span class="pressure-trend-label" style="color: ${config.color}">${config.label}</span>
    `;
}

// ==========================================
// HUMIDITY + DEW POINT
// ==========================================

function renderHumidity(humidity, isMixedDew = false) {
    if (!humidity) return;

    const humVal = humidity.value;
    if (humVal != null) {
        document.getElementById('humidity-val').textContent = humVal;
    }

    const dewEl = document.getElementById('humidity-dew-val');
    if (dewEl) {
        dewEl.textContent = humidity.dewPoint != null
            ? `${isMixedDew ? '~' : ''}${humidity.dewPoint.toFixed(1)}°C`
            : '--°C';
    }

    renderDewPointStatus(humidity, isMixedDew);
}

function renderDewPointStatus(humidity, isMixedDew = false) {
    const spreadValEl = document.getElementById('dew-spread-val');
    const dewTEl      = document.getElementById('dew-t');
    const dewTdEl     = document.getElementById('dew-td');
    const badgeEl     = document.getElementById('dew-status');

    if (!spreadValEl) return;

    const dewPoint = humidity?.dewPoint;
    const risk     = humidity?.dewPointRisk;

    const tempText = document.getElementById('avg-temp')?.textContent;
    const temp     = tempText && tempText !== '--' ? parseFloat(tempText) : null;

    if (dewPoint == null || temp == null) {
        // Clear every field, not just the spread. A sensor that drops out
        // mid-session would otherwise leave the last good T / Td and the risk
        // badge on screen beside a blank spread — the card would go on
        // asserting a condensation risk from a reading that no longer exists.
        spreadValEl.textContent = '--°';
        if (dewTEl)  dewTEl.textContent  = '--';
        if (dewTdEl) dewTdEl.textContent = '--';
        resetDewBadge(badgeEl);
        return;
    }

    const spread = parseFloat((temp - dewPoint).toFixed(1));

    spreadValEl.textContent = `${isMixedDew ? '~' : ''}${spread.toFixed(1)}°`;
    if (dewTEl)  dewTEl.textContent  = temp.toFixed(1);
    if (dewTdEl) dewTdEl.textContent = dewPoint.toFixed(1);

    if (!badgeEl) return;
    // A reading with no risk classification clears the badge for the same
    // reason as the branch above — never leave a stale verdict standing.
    if (!risk) {
        resetDewBadge(badgeEl);
        return;
    }

    const config      = DEW_POINT_RISK_CONFIG[risk] ?? DEW_POINT_RISK_CONFIG.UNLIKELY;
    badgeEl.className = `dew-status-badge ${config.cssClass}`;
    // Wrap in a span so text-overflow:ellipsis works inside the flex container.
    badgeEl.innerHTML = `<span class="dew-badge-text">${config.label}</span>`;
    badgeEl._dewRisk  = risk;
    badgeEl._dewMixed = isMixedDew;
}

// Neutral "no reading" state — bare badge class and a `--`, matching the
// wetness badge and the rest of the card's placeholders. (The template ships
// "Caution" as the pre-render text; once a poll lands with no dew data this
// replaces it, since a risk word with nothing behind it is the same problem in
// smaller form.) Clearing `_dewRisk` also disables the badge's popover:
// metric-popovers.js only opens it when a risk is stashed, so a click can no
// longer surface a stale explanation.
function resetDewBadge(badgeEl) {
    if (!badgeEl) return;
    badgeEl.className = 'dew-status-badge';
    badgeEl.innerHTML = '<span class="dew-badge-text">--</span>';
    badgeEl._dewRisk  = null;
    badgeEl._dewMixed = false;
}

// ==========================================
// SURFACE WETNESS BADGE (inside humidity card)
// ==========================================

function renderSurfaceWetness(wetness) {
    const badgeEl = document.getElementById('wetness-badge');
    const textEl  = document.getElementById('wetness-status-text');

    if (!badgeEl) return;

    badgeEl._wetnessData = wetness ?? null;

    const status = wetness?.surfaceWetnessStatus;

    if (!status) {
        badgeEl.className  = 'wetness-status-badge wetness-dry';
        textEl.textContent = '--';
        return;
    }

    const config = SURFACE_WETNESS_CONFIG[status] ?? SURFACE_WETNESS_CONFIG.DRY;
    badgeEl.className  = `wetness-status-badge ${config.cssClass}`;
    textEl.textContent = config.label;
}

// ==========================================
// WIND
// ==========================================

function renderWind(wind) {
    if (!wind) return;
    document.getElementById('wind-speed').textContent = wind.speed ?? '--';
    document.getElementById('wind-gusts').textContent = wind.gusts ?? '--';

    const arrowEl = document.getElementById('wind-direction-arrow');
    const labelEl = document.getElementById('wind-direction-label');
    const degEl   = document.getElementById('wind-direction-deg');

    if (wind.direction != null) {
        if (arrowEl) {
            arrowEl.textContent = '↑';
            arrowEl.style.transform = `rotate(${wind.direction}deg)`;
        }
        if (labelEl) labelEl.textContent = wind.directionLabel ?? '--';
        if (degEl)   degEl.textContent   = Math.round(wind.direction);
    } else {
        if (arrowEl) { arrowEl.textContent = '–'; arrowEl.style.transform = ''; }
        if (labelEl) labelEl.textContent = '--';
        if (degEl)   degEl.textContent   = '--';
    }
}

// ==========================================
// UV INDEX
// ==========================================

function renderUvIndex(uv) {
    const valEl   = document.getElementById('uv-val');
    const levelEl = document.getElementById('uv-level');
    if (!valEl) return;

    const value = uv?.value;
    valEl.textContent = value != null ? value.toFixed(1) : '--';

    if (levelEl) {
        const level = uv?.uvLevel ?? null;
        levelEl.textContent = level ? level.replace('_', ' ') : '--';
        levelEl.className   = `uv-level-badge ${UV_CSS[level] ?? ''}`;
    }
}

// ==========================================
// STALENESS HINTS
// ==========================================

// `dataStatus` is MQTT sensor lag — only ever shown on cards actually backed
// by the local sensor. API-backed cards get their own provider passed in and
// are skipped entirely, since sensor lag says nothing about Open-Meteo data.
function updateStalenessHints(dataStatus, dto) {
    const isStale = dataStatus && dataStatus !== 'LIVE';
    const HINT_TARGETS = [
        { selector: '#temperature-card .main-value', provider: dto?.temperature?.dataDetails?.dataProvider },
        { selector: '#pressure-card .main-value',    provider: dto?.pressure?.dataDetails?.dataProvider },
        { selector: '#humidity-card .main-value',    provider: dto?.humidity?.dataDetails?.dataProvider },
        { selector: '#wind-card .main-value',         provider: dto?.wind?.metricDataDetails?.dataProvider },
        { selector: '#uv-card .main-value',           provider: dto?.uvIndex?.dataDetails?.dataProvider },
    ];
    const HINT_LABELS = { DELAYED: '~ delayed', STALE: '~ stale', OFFLINE: '~ offline', EMPTY: '~ no data' };
    const HINT_COLORS = { DELAYED: '#fcd34d',   STALE: '#f97316',  OFFLINE: '#ef4444',   EMPTY: '#6b7280'   };

    HINT_TARGETS.forEach(({ selector, provider }) => {
        const target = document.querySelector(selector);
        if (!target) return;
        const parent = target.parentElement;
        let hint = parent.querySelector('.data-stale-hint');
        if (isStale && provider !== 'EXTERNAL_API') {
            if (!hint) {
                hint = document.createElement('span');
                hint.className = 'data-stale-hint';
                target.insertAdjacentElement('afterend', hint);
            }
            hint.textContent = HINT_LABELS[dataStatus] ?? '~ outdated';
            hint.style.color = HINT_COLORS[dataStatus] ?? '#6b7280';
        } else if (hint) {
            hint.remove();
        }
    });
}

// ==========================================
// MAIN RENDER
// ==========================================

export function renderMetrics(dto, dataStatus) {
    const temp     = dto?.temperature;
    const pressure = dto?.pressure;
    const humidity = dto?.humidity;
    const wetness  = dto?.surfaceWetness;
    const wind     = dto?.wind;
    const uv       = dto?.uvIndex;

    const isMixedDew = (temp?.dataDetails?.dataProvider ?? 'LOCAL_SENSOR')
                     !== (humidity?.dataDetails?.dataProvider ?? 'LOCAL_SENSOR');

    renderTemperature(temp);
    renderPressure(pressure);
    renderHumidity(humidity, isMixedDew);
    renderSurfaceWetness(wetness);
    renderWind(wind);
    renderUvIndex(uv);

    populatePopup('temperature-card', temp?.dataDetails,     dataStatus);
    populatePopup('pressure-card',    pressure?.dataDetails, dataStatus);
    populatePopup('humidity-card',    humidity?.dataDetails, dataStatus);
    populatePopup('wind-card',        wind?.metricDataDetails, dataStatus);
    populatePopup('uv-card',          uv?.dataDetails,       dataStatus);

    setStatusCircleColor(document.querySelector('#temperature-card .status-circle'), temp?.dataDetails?.quality,       dataStatus, temp?.dataDetails?.dataProvider);
    setStatusCircleColor(document.querySelector('#pressure-card .status-circle'),    pressure?.dataDetails?.quality,   dataStatus, pressure?.dataDetails?.dataProvider);
    setStatusCircleColor(document.querySelector('#humidity-card .status-circle'),    humidity?.dataDetails?.quality,   dataStatus, humidity?.dataDetails?.dataProvider);
    setStatusCircleColor(document.querySelector('#wind-card .status-circle'),        wind?.metricDataDetails?.quality, dataStatus, wind?.metricDataDetails?.dataProvider);
    setStatusCircleColor(document.querySelector('#uv-card .status-circle'),          uv?.dataDetails?.quality,         dataStatus, uv?.dataDetails?.dataProvider);

    updateStalenessHints(dataStatus, dto);
}
