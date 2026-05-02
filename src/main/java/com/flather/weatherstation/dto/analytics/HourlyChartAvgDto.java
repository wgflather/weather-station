package com.flather.weatherstation.dto.analytics;

import lombok.Builder;

import java.time.ZonedDateTime;

@Builder
public record HourlyChartAvgDto(ZonedDateTime hour, double hourlyValue) {
}
