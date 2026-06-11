package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.SurfaceWetnessStatus;
import com.flather.weatherstation.dto.dashboard.MetricDataDetails;

public record SurfaceWetnessDto(
    Double value, MetricDataDetails dataDetails, SurfaceWetnessStatus surfaceWetnessStatus) {}
