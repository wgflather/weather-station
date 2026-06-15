package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.SurfaceWetnessStatus;

public record SurfaceWetnessDto(
    Double value, MetricDataDetails dataDetails, SurfaceWetnessStatus surfaceWetnessStatus) {}
