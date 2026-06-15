package com.flather.weatherstation.dto.astronomy;

/**
 * Response payload for {@code GET /api/astronomy/daily} — the astronomy values that only change at
 * calendar-day boundaries (or when the configured timezone changes).
 *
 * <p>The client fetches this once on page load and then only re-fetches when the {@code dailyKey}
 * returned by the live endpoint stops matching the key associated with the cached daily payload.
 *
 * @param sunDailyEvents today's solar rise/set, transit, twilights, and day/night length.
 * @param moonDailyEvents today's lunar rise, set, and transit.
 * @param dailyKey the {@code "<LocalDate>@<ZoneId>"} key this payload was computed under. The
 *     client stores it and compares it against the live endpoint's {@code dailyKey} to detect
 *     midnight rollovers or runtime timezone changes.
 */
public record AstronomyDailyEventsDto(
    SunDailyEvents sunDailyEvents, MoonDailyEvents moonDailyEvents, String dailyKey) {}
