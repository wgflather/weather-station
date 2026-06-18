package com.flather.weatherstation.dto.astronomy;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.ZonedDateTime;
import java.util.List;

/**
 * Lunar events that are fixed for a given calendar day at the observer's location — they do not
 * change second-to-second and only need to be recomputed when the date rolls over.
 *
 * @param rise moonrise — moment the moon's upper limb crosses the horizon going up.
 * @param set moonset — moment the moon's upper limb crosses the horizon going down.
 * @param peak today's lunar transit: peak altitude (degrees) and the time it occurs.
 * @param moonCurve full-resolution altitude curve; excluded from the /api/astronomy/daily response
 *     (served separately via /api/astronomy/curve at the caller's requested resolution).
 */
public record MoonDailyEvents(
    ZonedDateTime rise,
    ZonedDateTime set,
    TransitDto peak,
    @JsonIgnore List<AstronomyPoint> moonCurve) {}
