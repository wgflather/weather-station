package com.flather.weatherstation.dto.weather;


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
