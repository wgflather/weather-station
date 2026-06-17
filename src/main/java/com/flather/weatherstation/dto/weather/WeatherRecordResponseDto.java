package com.flather.weatherstation.dto.weather;

import java.time.ZonedDateTime;
import lombok.*;

@RequiredArgsConstructor
@AllArgsConstructor
@Builder
@Data
@ToString
public class WeatherRecordResponseDto {

  private Double temperature;

  private Double pressure;

  private Double humidity;

  private Double surfaceWetness;

  private Double wind;

  private Double windDirection;

  private Double uvIndex;

  private ZonedDateTime measuredAtTimeZoned;
}
