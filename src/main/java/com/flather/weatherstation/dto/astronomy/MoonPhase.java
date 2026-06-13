package com.flather.weatherstation.dto.astronomy;

/**
 * Lunar phase snapshot at a given moment.
 *
 * @param illuminationPercent fraction of the lunar disk lit by the sun, expressed as a percentage
 *     (0 = new moon, 100 = full moon).
 * @param ageDays days elapsed since the last new moon, within the ~29.53-day synodic cycle.
 * @param phaseName human-readable phase label, e.g. "New Moon", "Waxing Crescent", "First Quarter",
 *     "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent".
 */
public record MoonPhase(double illuminationPercent, double ageDays, String phaseName) {}
