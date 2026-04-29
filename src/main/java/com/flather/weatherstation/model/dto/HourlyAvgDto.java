package com.flather.weatherstation.model.dto;

import java.time.ZonedDateTime;

public record HourlyAvgDto(ZonedDateTime hour, double value) {
}
