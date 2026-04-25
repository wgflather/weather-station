package com.flather.weatherstation.model.dto;


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
