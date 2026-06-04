package com.flather.weatherstation.dto.analytics;

public record TemperatureDto(Double avgTemp, TrendResult trendResult, Double min, Double max) {}
