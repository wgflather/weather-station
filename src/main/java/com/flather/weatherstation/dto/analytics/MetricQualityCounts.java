package com.flather.weatherstation.dto.analytics;

/**
 * Per-metric reading counts inside one bucket.
 *
 * <p>{@code notConfiguredCount} means the station did not send the field at all — absent hardware
 * rather than a fault. It is tracked separately because it is the only state that is not a health
 * signal, and lumping it in with {@code missingCount} would report a sensor nobody fitted as one
 * that is failing.
 */
public record MetricQualityCounts(
    int okCount, int spikeCount, int anomalyCount, int missingCount, int notConfiguredCount) {}
