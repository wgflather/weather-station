package com.flather.weatherstation.dto.astronomy;

import java.time.ZonedDateTime;
import java.util.List;

/**
 * Solar events that are fixed for a given calendar day at the observer's location — they do not
 * change second-to-second and only need to be recomputed when the date rolls over.
 *
 * @param rise sunrise today — moment the sun's upper limb crosses the horizon going up. Null during
 *     polar day/night when the sun never crosses the horizon.
 * @param set sunset today — moment the sun's upper limb crosses the horizon going down. Null during
 *     polar day/night.
 * @param solarNoon solar noon: the sun's peak altitude and the time of its meridian transit.
 * @param times full set of twilight transitions (astronomical / nautical / civil dawn and dusk)
 *     plus sunrise and sunset bundled together.
 * @param dayLengthSeconds length of the day from sunrise to sunset, in seconds.
 * @param nightLengthSeconds length of astronomical night (sun below -18°), in seconds.
 */
public record SunDailyEvents(
    ZonedDateTime rise,
    ZonedDateTime set,
    TransitDto solarNoon,
    SunTimesDto times,
    long dayLengthSeconds,
    long nightLengthSeconds,
    List<AstronomyPoint> sunCurve) {}
