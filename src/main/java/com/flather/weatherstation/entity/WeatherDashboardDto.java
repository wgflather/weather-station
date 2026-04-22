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

    private WeatherRecordResponseDto latestRecord;
    private WeatherRecordResponseDto maxTempRecord;
    private WeatherRecordResponseDto minTempRecord;
}
