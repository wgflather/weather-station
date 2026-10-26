// system-health.js
//
// The header's health readout: the status dot, its label, and the popover
// listing sensor status, data lag, MQTT connection, last reading and today's
// record count.
//
// Pure presentation — renderSystemHealth() takes the systemHealth slice of the
// live dashboard DTO and writes it out, renderConnection() takes whether the
// server is currently answering at all; fetch-data.js polls and calls both.
// initHealthPopover() wires the dot's click/Escape handling once at boot.

import {
    DATA_STATUS_COLORS,
    DATA_STATUS_INFO,
    STATUS_DOT_GLOW,
} from './dashboard-constants.js';
import { closeAllPopovers } from './metric-popovers.js';
import { toCssPx } from './ui-zoom.js';

// Formats a lag duration (minutes) for the System Health popover. Bare
// minute counts get unreadable once a sensor has been offline for a while
// (e.g. "38661 min"), so this steps up to hours/days once the count grows —
// same bucket style as formatTimeSince, but driven by a minute count
// directly rather than an ISO timestamp diffed against now.
function formatLagMinutes(minutes) {
    if (minutes == null) return '--';
    if (minutes < 60) return `${minutes} min`;

    const hours    = Math.floor(minutes / 60);
    const remMins  = minutes % 60;
    if (hours < 24) return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;

    const days     = Math.floor(hours / 24);
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
}

// Sensor status becomes OFFLINE purely from data lag (see DataStatus.fromLag) —
// it doesn't know *why* data stopped arriving. Cross-reference the separate MQTT
// connection flag so the UI can say which one actually failed, instead of a bare
// "OFFLINE" that reads as ambiguous now that MQTT has its own status row.
function describeSensorStatus(systemHealth) {
    if (systemHealth.status !== 'OFFLINE') {
        return { popoverText: systemHealth.status, labelText: DATA_STATUS_INFO[systemHealth.status]?.label };
    }
    return systemHealth.mqttStatus
        ? { popoverText: 'OFFLINE', labelText: 'Sensors Offline' }
        : { popoverText: 'OFFLINE', labelText: 'MQTT Offline' };
}

// The server's verdict above only describes the moment it was fetched. If the
// server stops answering, or the page sat frozen in a background tab, that
// verdict stays on screen — a pulsing green "Live" over readings hours old.
// So the client keeps its own view of the link, and while it is not 'ok' the
// header shows that instead of the server's last word:
//   ok      — a live poll succeeded recently
//   syncing — nothing recent, a request is in flight (boot, or just resumed)
//   lost    — nothing recent and the last attempt failed
const LINK_STYLE = {
    syncing: { label: 'Updating…',     server: 'Reconnecting…' },
    lost:    { label: 'No connection', server: 'Unreachable'   },
};
const LINK_COLOR = '#94a3b8';

let lastHealth = null;
let link       = { state: null, lastOkAt: null };   // null: first report always paints

export function renderSystemHealth(systemHealth) {
    if (!systemHealth) return;
    lastHealth = systemHealth;
    paint();
}

export function renderConnection(state, lastOkAt) {
    if (state === link.state && lastOkAt === link.lastOkAt) {
        paintLastContact();   // only the "ago" text moves
        return;
    }
    link = { state, lastOkAt };
    paint();
}

function paint() {
    // Cards and chart dim while their values are unverified — styled in
    // style.css under body.link-unverified.
    document.body.classList.toggle('link-unverified', link.state !== 'ok');

    const serverEl = document.getElementById('serverStatus');
    if (serverEl) {
        serverEl.textContent = link.state === 'ok' ? 'Connected' : LINK_STYLE[link.state].server;
        serverEl.style.color = link.state === 'ok' ? DATA_STATUS_COLORS.LIVE : LINK_COLOR;
    }
    paintLastContact();

    if (lastHealth) paintHealth(lastHealth);
    if (link.state !== 'ok') paintLinkHeader();
}

function paintLastContact() {
    const el = document.getElementById('lastContact');
    if (!el) return;
    if (!link.lastOkAt) { el.textContent = 'never'; return; }
    const minutes = Math.floor((Date.now() - link.lastOkAt) / 60000);
    el.textContent = minutes < 1 ? 'just now' : `${formatLagMinutes(minutes)} ago`;
}

// A hollow grey ring: no verdict, rather than a colour that claims one.
function paintLinkHeader() {
    const dot = document.getElementById('health-dot');
    if (dot) {
        dot.style.backgroundColor = 'transparent';
        dot.style.boxShadow = `inset 0 0 0 2px ${LINK_COLOR}`;
        dot.classList.remove('pulsing');
        dot.classList.toggle('syncing', link.state === 'syncing');
    }
    const label = document.getElementById('health-status-label');
    if (label) {
        label.textContent = LINK_STYLE[link.state].label;
        label.style.color = LINK_COLOR;
    }
}

function paintHealth(systemHealth) {
    const statusDetail = describeSensorStatus(systemHealth);

    document.getElementById('status').textContent       = statusDetail.popoverText;
    document.getElementById('lag').textContent          = formatLagMinutes(systemHealth.lagMinutes);
    document.getElementById('todayRecords').textContent = systemHealth.recordsToday;

    const lastUpdate = document.getElementById('lastUpdate');
    lastUpdate.textContent = systemHealth.lastMeasuredAt
        ? new Date(systemHealth.lastMeasuredAt).toLocaleTimeString('en-GB')
        : '--:--:--';

    const mqttStatusEl = document.getElementById('mqttStatus');
    if (mqttStatusEl) {
        mqttStatusEl.textContent = systemHealth.mqttStatus ? 'Connected' : 'Disconnected';
        mqttStatusEl.style.color = systemHealth.mqttStatus ? DATA_STATUS_COLORS.LIVE : DATA_STATUS_COLORS.OFFLINE;
    }

    const color = DATA_STATUS_COLORS[systemHealth.status] ?? '#6b7280';
    document.getElementById('status').style.color = color;

    // Drive the header status dot — color, glow, and pulse when live.
    const dot = document.getElementById('health-dot');
    if (dot) {
        dot.style.backgroundColor = color;
        dot.style.boxShadow = `0 0 7px 2px ${STATUS_DOT_GLOW[systemHealth.status] ?? 'rgba(107,114,128,0.4)'}`;
        dot.classList.toggle('pulsing', systemHealth.status === 'LIVE');
        dot.classList.remove('syncing');
    }
    const label = document.getElementById('health-status-label');
    if (label) {
        label.textContent = statusDetail.labelText ?? '--';
        label.style.color = color;
    }
}

export function initHealthPopover() {
    const btn     = document.getElementById('health-dot-btn');
    const popover = document.getElementById('health-popover');
    if (!btn || !popover) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const opening = !popover.classList.contains('open');
        if (opening) closeAllPopovers('health');
        popover.classList.toggle('open', opening);
        btn.setAttribute('aria-expanded', String(opening));
        popover.setAttribute('aria-hidden', String(!opening));

        if (opening) {
            // Position below the button, right-aligned to it. Measured in
            // viewport px, written in CSS px — see ui-zoom.js.
            const rect = btn.getBoundingClientRect();
            popover.style.top   = `${toCssPx(rect.bottom + 6)}px`;
            popover.style.right = `${toCssPx(window.innerWidth - rect.right)}px`;
            popover.style.left  = 'auto';
        }
    });

    // Close on any outside click (piggyback the existing global handler).
    document.addEventListener('click', () => {
        if (popover.classList.contains('open')) {
            popover.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
            popover.setAttribute('aria-hidden', 'true');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && popover.classList.contains('open')) {
            popover.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
            popover.setAttribute('aria-hidden', 'true');
            btn.focus();
        }
    });
}
