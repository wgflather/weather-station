package com.flather.weatherstation.dto.analytics;

import java.time.ZonedDateTime;
import lombok.Builder;

@Builder
public record HourlyChartAvgDto(ZonedDateTime hour, double hourlyValue) {}
