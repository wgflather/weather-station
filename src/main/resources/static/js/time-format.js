// time-format.js
//
// Date/time formatters shared by the astronomy cards and the astronomy modal.
// Extracted so the modal could move out of fetch-data.js without duplicating
// them — the card and the modal must format the same instant identically.

/** HH:MM, or `--:--` for missing/unparseable input. */
export function formatTimeOfDay(isoString) {
    if (!isoString) return '--:--';
    const date = new Date(isoString);
    return isNaN(date.getTime())
        ? '--:--'
        : date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Date-aware label for places where space is not a constraint: bare HH:MM
 * today, "Tomorrow HH:MM" tomorrow, "12 Aug HH:MM" beyond that.
 */
export function formatMoonEvent(isoString) {
    if (!isoString) return '—';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '—';
    const timeStr  = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const today    = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (date.toDateString() === today.toDateString())    return timeStr;
    if (date.toDateString() === tomorrow.toDateString()) return `Tomorrow ${timeStr}`;
    return `${date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })} ${timeStr}`;
}

/** Seconds as `Nh MMm`, or `--` when absent. */
export function formatDuration(totalSeconds) {
    if (totalSeconds == null) return '--';
    const seconds = Math.abs(totalSeconds);
    const hours   = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}
