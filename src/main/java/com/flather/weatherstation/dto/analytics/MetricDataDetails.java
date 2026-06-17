package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.DataProvider;
import com.flather.weatherstation.domain.constant.DataQuality;
import java.time.ZonedDateTime;

public record MetricDataDetails(
    Double lastValue,
    ZonedDateTime arrivedAt,
    DataQuality quality,
    String sensor,
    String metricName,
    DataProvider dataProvider) {}
