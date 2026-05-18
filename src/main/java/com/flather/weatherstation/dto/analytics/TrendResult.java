package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.model.constant.TrendDirection;

public record TrendResult(double changeValue, TrendDirection direction) {}
