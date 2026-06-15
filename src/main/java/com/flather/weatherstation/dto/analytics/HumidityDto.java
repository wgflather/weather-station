package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.DewPointRisk;

public record HumidityDto(
    Double value, MetricDataDetails dataDetails, Double dewPoint, DewPointRisk dewPointRisk) {}
