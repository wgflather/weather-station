package com.flather.weatherstation.model.dto;

import lombok.Builder;

import java.time.ZonedDateTime;

@Builder
public record HourlyChartAvgDto(ZonedDateTime hour, double hourlyValue) {
}
