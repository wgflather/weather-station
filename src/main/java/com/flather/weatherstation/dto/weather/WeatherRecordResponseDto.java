package com.flather.weatherstation.dto.weather;

import java.time.ZonedDateTime;
import lombok.*;

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
