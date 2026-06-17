package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.UvLevel;

public record UvIndexDto(Double value, UvLevel uvLevel, MetricDataDetails dataDetails) {}
