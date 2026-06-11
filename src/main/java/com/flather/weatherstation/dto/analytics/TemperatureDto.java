package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.dto.dashboard.MetricDataDetails;

public record TemperatureDto(
    Double value, TrendResult trendResult, Double min, Double max, MetricDataDetails dataDetails) {}
