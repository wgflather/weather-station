package com.flather.weatherstation.dto.astronomy;

/**
 * Continuously-changing solar state — recomputed every time the dashboard updates because the value
 * depends on the exact moment of observation.
 *
 * @param currentAltitude current altitude of the sun above the horizon in degrees (negative when
 *     below the horizon).
 */
public record SunSnapshot(double currentAltitude) {}
