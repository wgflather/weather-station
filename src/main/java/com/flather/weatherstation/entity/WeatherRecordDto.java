package com.flather.weatherstation.entity;


import lombok.*;

import java.time.Instant;

@RequiredArgsConstructor
@AllArgsConstructor
@Builder
@Data
@ToString
public class WeatherRecordDto {

    private double temperature;

    private double pressure;

    private Instant createdAt;
}
