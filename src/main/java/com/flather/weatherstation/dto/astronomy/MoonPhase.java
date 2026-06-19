package com.flather.weatherstation.dto.astronomy;

/**
 * Lunar phase snapshot at a given moment.
 *
 * @param illuminationPercent fraction of the lunar disk lit by the sun, expressed as a percentage
 *     (0 = new moon, 100 = full moon).
 * @param ageDays days elapsed since the last new moon, within the ~29.53-day synodic cycle.
 * @param phaseName human-readable phase label, e.g. "New Moon", "Waxing Crescent", "First Quarter",
 *     "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent".
 * @param phaseDegrees precise phase angle 0–360°: 0=new moon, 90=first quarter, 180=full,
 *     270=last quarter. Used by the frontend canvas renderer to draw the terminator accurately
 *     without reconstructing it from illuminationPercent + phaseName.
 */
public record MoonPhase(
    double illuminationPercent, double ageDays, String phaseName, double phaseDegrees) {}
