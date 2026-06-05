package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.TrendDirection;

public record TrendResult(double changeValue, TrendDirection direction) {}
