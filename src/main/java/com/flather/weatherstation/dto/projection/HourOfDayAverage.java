package com.flather.weatherstation.dto.projection;

/**
 * One hour of the day, averaged over every day in a range — a point on the diurnal cycle rather
 * than a point in time. Distinct from {@link DataPoint}, whose {@code hour} is an instant.
 *
 * @param hourOfDay the local hour, 0–23, in the station's zone.
 * @param value the mean across the range of that hour's hourly averages.
 * @param samples how many days contributed. An hour missed on most days is not comparable with one
 *     observed throughout, so callers rank on {@code value} only once this clears a floor.
 */
public record HourOfDayAverage(Integer hourOfDay, Double value, Long samples) {}
