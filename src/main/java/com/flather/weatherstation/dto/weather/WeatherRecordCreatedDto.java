package com.flather.weatherstation.dto.weather;

import java.time.Instant;
import lombok.*;

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
