package com.flather.weatherstation.dto.astronomy;

import java.time.ZonedDateTime;

/**
 * Today's solar transitions, ordered from pre-dawn through post-sunset.
 *
 * <p>Twilight boundaries follow the standard convention based on the sun's geometric altitude
 * relative to the horizon:
 *
 * <ul>
 *   <li>Astronomical twilight: sun between -18° and -12°
 *   <li>Nautical twilight: sun between -12° and -6°
 *   <li>Civil twilight: sun between -6° and 0°
 * </ul>
 *
 * @param astronomicalNightEnd sun rises through -18° — astronomical twilight begins, true night
 *     ends. Null when this event does not occur today (polar regions).
 * @param nauticalDawn sun rises through -12° — nautical twilight begins.
 * @param civilDawn sun rises through -6° — civil twilight begins.
 * @param sunrise sun crosses the horizon (0°) going up — actual sunrise. Null when no rise/set
 *     occurs (polar day/night); see {@code solarCondition}.
 * @param sunset sun crosses the horizon (0°) going down — actual sunset. Null when no rise/set
 *     occurs (polar day/night); see {@code solarCondition}.
 * @param civilDusk sun sinks past -6° — civil dusk begins.
 * @param nauticalDusk sun sinks past -12° — nautical dusk begins.
 * @param astronomicalNightStart sun sinks past -18° — astronomical twilight ends, true night
 *     begins. Null when this event does not occur today (polar regions).
 * @param solarCondition whether the location is on a normal day/night cycle today or in polar
 *     day/night.
 */
public record SunTimesDto(
    ZonedDateTime astronomicalNightEnd,
    ZonedDateTime nauticalDawn,
    ZonedDateTime civilDawn,
    ZonedDateTime sunrise,
    ZonedDateTime sunset,
    ZonedDateTime civilDusk,
    ZonedDateTime nauticalDusk,
    ZonedDateTime astronomicalNightStart,
    SolarCondition solarCondition) {}
