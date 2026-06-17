package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.DataProvider;
import com.flather.weatherstation.domain.constant.DataQuality;

public record MetricDataDetails(
    Double lastValue,
    String arrivedAt,
    DataQuality quality,
    String sensor,
    String metricName,
    DataProvider dataProvider) {}
