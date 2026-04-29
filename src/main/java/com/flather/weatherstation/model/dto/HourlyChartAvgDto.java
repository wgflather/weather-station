package com.flather.weatherstation.model.dto;

import java.time.ZonedDateTime;

public record HourlyChartAvgDto(ZonedDateTime hour, double hourlyValue) {
}
