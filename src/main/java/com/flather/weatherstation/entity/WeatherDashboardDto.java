package com.flather.weatherstation.entity;

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
    private WeatherRecordResponseDto maxTodayTemp;
    private WeatherRecordResponseDto minTodayTemp;
    private ZonedDateTime lastMeasuredAt;
    private long lagMinutes;
    private long recordsToday;
    private DataStatus status;
}
