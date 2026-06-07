package com.flather.weatherstation.dto.dashboard;

import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;

import java.time.ZonedDateTime;

public record MetricDataDetails(Double lastValue, ZonedDateTime arrivedAt, DataQuality quality, String sensor, String metricName) {
}
