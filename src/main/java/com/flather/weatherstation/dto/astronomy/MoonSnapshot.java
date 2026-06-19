package com.flather.weatherstation.dto.astronomy;

/**
 * Continuously-changing lunar state — recomputed every time the dashboard updates because each
 * value depends on the exact moment of observation.
 *
 * @param currentAltitude current altitude of the moon above the horizon in degrees (negative when
 *     below the horizon).
 * @param distanceKm geocentric distance to the moon in kilometres (converted from the astronomy
 *     library's astronomical-unit value).
 * @param phase lunar phase: illumination %, age in days, human-readable name, and precise phase
 *     degrees.
 * @param constellation name of the constellation the moon is currently inside.
 * @param parallacticAngle rotation of the terminator in degrees as seen from the observer's
 *     latitude. Derived from the moon's hour angle and declination. Used by the frontend canvas
 *     renderer to tilt the moon correctly for the observer's geographic position.
 */
public record MoonSnapshot(
    double currentAltitude,
    double distanceKm,
    MoonPhase phase,
    String constellation,
    double parallacticAngle) {}
