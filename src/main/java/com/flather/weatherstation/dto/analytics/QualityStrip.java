package com.flather.weatherstation.dto.analytics;

import java.time.Instant;
import java.util.List;

public record QualityStrip(
    Instant from,
    Instant to,
    int bucketMinutes,
    List<QualityBucket> bucketList,
    List<MetricQualitySummary> metricQualitySummaries,
    List<DataGap> gaps) {}
