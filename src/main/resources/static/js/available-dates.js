// available-dates.js
//
// Flatpickr plumbing for "only let the user pick days we actually have data
// for". The dashboard's history modal and the admin database view both need
// it, against different endpoints, so this is a factory rather than a
// singleton: each caller gets its own month cache keyed to its own endpoint.
//
// The calendar can't know which days exist until it asks the server, and it
// asks a month at a time as the user pages through. isDateEnabled() therefore
// answers from cache only — a month that hasn't loaded reads as "nothing
// enabled", and ensureMonthsLoaded() redraws once the fetch resolves. That is
// why the picker briefly shows every cell disabled when it first opens.

function pad2(n) {
    return String(n).padStart(2, '0');
}

// Date -> 'YYYY-MM-DD' in *local* time. Deliberately not toISOString(), which
// converts to UTC and can land on the wrong calendar day either side of
// midnight.
export function isoDateKey(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * @param endpoint path taking `?from=&to=` and returning a JSON array of
 *                 'YYYY-MM-DD' strings
 */
export function createAvailableDates(endpoint) {
    // Populated on demand by loadMonth(); persists for the lifetime of the page.
    const monthCache    = new Map();
    const monthInFlight = new Map();

    function monthKey(year, month) {
        return `${year}-${pad2(month + 1)}`;
    }

    function monthBounds(year, month) {
        const first = `${year}-${pad2(month + 1)}-01`;
        // Day 0 of the next month is the last day of this one.
        const lastDay = new Date(year, month + 1, 0).getDate();
        return { from: first, to: `${year}-${pad2(month + 1)}-${pad2(lastDay)}` };
    }

    // In-flight map dedupes the concurrent calls ensureMonthsLoaded() makes
    // when several months are visible at once.
    async function loadMonth(year, month) {
        const key = monthKey(year, month);
        if (monthCache.has(key))    return monthCache.get(key);
        if (monthInFlight.has(key)) return monthInFlight.get(key);

        const { from, to } = monthBounds(year, month);
        const promise = (async () => {
            try {
                const res = await fetch(`${endpoint}?from=${from}&to=${to}`);
                if (!res.ok) throw new Error(`status ${res.status}`);
                const set = new Set(await res.json());
                monthCache.set(key, set);
                return set;
            } catch {
                // On failure cache empty, so we don't retry forever this session.
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
        const set = monthCache.get(monthKey(date.getFullYear(), date.getMonth()));
        // Not yet loaded — disable the cell; it enables on the next redraw
        // after loadMonth() resolves.
        if (!set) return false;
        return set.has(isoDateKey(date));
    }

    // Flatpickr can show several months at once (showMonths > 1); load every
    // visible one. Both callers default to 1, but this stays correct if that
    // is ever bumped.
    async function ensureMonthsLoaded(instance) {
        const months = instance.config.showMonths || 1;
        const promises = [];
        for (let i = 0; i < months; i++) {
            let year  = instance.currentYear;
            let month = instance.currentMonth + i;
            while (month > 11) { month -= 12; year += 1; }
            promises.push(loadMonth(year, month));
        }
        await Promise.all(promises);
        instance.redraw();
    }

    /**
     * Shared flatpickr config. `overrides` is merged over the defaults, except
     * for onOpen, which is *chained*: the caller's runs first (the history
     * modal repositions the calendar there) and the month load follows.
     */
    function pickerOptions(overrides = {}) {
        const { onOpen, ...rest } = overrides;
        return {
            dateFormat:    'Y-m-d',
            maxDate:       'today',
            disableMobile: true,
            enable:        [isDateEnabled],
            onMonthChange: (_sel, _str, instance) => ensureMonthsLoaded(instance),
            onYearChange:  (_sel, _str, instance) => ensureMonthsLoaded(instance),
            ...rest,
            onOpen: (selected, str, instance) => {
                onOpen?.(selected, str, instance);
                ensureMonthsLoaded(instance);
            },
        };
    }

    return { loadMonth, isDateEnabled, ensureMonthsLoaded, pickerOptions };
}
