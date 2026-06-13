package com.flather.weatherstation.dto.astronomy;

import java.time.ZonedDateTime;

/**
 * Lunar events that are fixed for a given calendar day at the observer's location — they do not
 * change second-to-second and only need to be recomputed when the date rolls over.
 *
 * @param rise moonrise — moment the moon's upper limb crosses the horizon going up.
 * @param set moonset — moment the moon's upper limb crosses the horizon going down.
 * @param peak today's lunar transit: peak altitude (degrees) and the time it occurs.
 */
public record MoonDailyEvents(ZonedDateTime rise, ZonedDateTime set, TransitDto peak) {}
