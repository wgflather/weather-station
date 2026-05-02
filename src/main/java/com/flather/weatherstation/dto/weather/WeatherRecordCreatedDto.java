package com.flather.weatherstation.dto.weather;

import lombok.*;

import java.time.Instant;

@RequiredArgsConstructor
@AllArgsConstructor
@Builder
@Data
@ToString
public class WeatherRecordCreatedDto {

    private double temperature;

    private double pressure;

    private Instant measuredAt;
}