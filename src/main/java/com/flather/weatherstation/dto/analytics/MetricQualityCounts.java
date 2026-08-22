package com.flather.weatherstation.dto.analytics;

public record MetricQualityCounts(
    int okCount, int spikeCount, int anomalyCount, int missingCount) {}
