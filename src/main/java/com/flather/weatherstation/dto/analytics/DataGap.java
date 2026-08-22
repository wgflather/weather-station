package com.flather.weatherstation.dto.analytics;

import java.time.Instant;

/**
 * The longest stretch of the strip window during which the station wrote no record at all.
 *
 * <p>This is deliberately not part of {@link MetricQualitySummary}: a gap means the row itself is
 * absent, so it applies to every metric simultaneously and is a property of the station, not of one
 * sensor. It is also the one fact the strip exists to surface that the per-metric counts cannot
 * express — an offline station contributes nothing to {@code missingCount}, which only counts rows
 * that exist with a failed field.
 *
 * <p>The window edges are included when measuring, so a station that has been silent since before
 * the window opened, or that died an hour ago and has not come back, both produce a gap rather than
 * being missed because there is no later reading to bound them.
 *
 * <p>There is always a longest gap, so this is never null — on a healthy station it is simply the
 * ordinary interval between two consecutive readings. Consumers should apply their own threshold
 * before presenting it as a fault.
 *
 * <p>Component order is load-bearing: bound positionally from a native query.
 */
public record DataGap(Instant from, Instant to, long minutes) {}
