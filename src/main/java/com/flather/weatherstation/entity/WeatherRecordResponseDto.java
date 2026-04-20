package com.flather.weatherstation.entity;


import lombok.*;

import java.time.ZonedDateTime;

@RequiredArgsConstructor
@AllArgsConstructor
@Builder
@Data
@ToString
public class WeatherRecordResponseDto {

    private double temperature;

    private double pressure;

    private ZonedDateTime measuredAtTimeZoned;
}
