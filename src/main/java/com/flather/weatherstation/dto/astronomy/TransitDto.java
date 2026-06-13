package com.flather.weatherstation.dto.astronomy;

import java.time.ZonedDateTime;

/**
 * A celestial body's transit across the local meridian — i.e. the moment it reaches its highest
 * point in the sky for the observer.
 *
 * @param alt altitude above the horizon at transit, in degrees.
 * @param time moment of meridian crossing.
 */
public record TransitDto(double alt, ZonedDateTime time) {}
