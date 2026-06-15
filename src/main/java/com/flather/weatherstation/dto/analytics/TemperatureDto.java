package com.flather.weatherstation.dto.analytics;

public record TemperatureDto(
    Double value, TrendResult trendResult, Double min, Double max, MetricDataDetails dataDetails) {}
