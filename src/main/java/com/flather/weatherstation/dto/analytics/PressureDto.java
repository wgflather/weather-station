package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.PressureTrend;

public record PressureDto(
    Double value,
    TrendResult trendResult,
    MetricDataDetails dataDetails,
    PressureTrend pressureTrend) {}
