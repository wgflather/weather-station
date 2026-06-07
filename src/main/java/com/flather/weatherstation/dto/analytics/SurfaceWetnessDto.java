package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.dto.dashboard.MetricDataDetails;

public record SurfaceWetnessDto(Long value, MetricDataDetails dataDetails) {
}
