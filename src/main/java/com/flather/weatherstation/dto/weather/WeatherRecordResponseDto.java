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

  private double pressure;

  private Double humidity;

  private ZonedDateTime measuredAtTimeZoned;
}
