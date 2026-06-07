package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.dto.dashboard.MetricDataDetails;

public record HumidityDto(Double value, MetricDataDetails dataDetails) {}
