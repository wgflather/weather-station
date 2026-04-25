package com.flather.weatherstation.model.dto;

import com.flather.weatherstation.model.constant.DataStatus;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;

import java.time.ZonedDateTime;

@Data
@AllArgsConstructor
@RequiredArgsConstructor
@Builder
public class WeatherDashboardDto {
    private WeatherAvgDto averages;
    private MinMaxValueDto minMaxTempValue;
    private ZonedDateTime lastMeasuredAt;
    private long lagMinutes;
    private long recordsToday;
    private DataStatus status;
}
