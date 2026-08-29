package com.flather.weatherstation.dto.analytics;

public record MetricQualitySummary(
    String metricName,
    int okCount,
    int spikeCount,
    int anomalyCount,
    int missingCount,
    int notConfiguredCount) {}
