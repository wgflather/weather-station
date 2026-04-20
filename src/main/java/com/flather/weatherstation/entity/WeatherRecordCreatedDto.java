package com.flather.weatherstation.entity;

import lombok.*;

import java.time.Instant;
import java.time.ZonedDateTime;

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