package com.flather.weatherstation.dto.weather;

import java.time.Instant;
import lombok.*;

@AllArgsConstructor
@NoArgsConstructor
@Builder
@Data
public class HourlyWeatherRecordDto {

  private String deviceId;

  private Double temperatureAvg;

  private Double pressureAvg;

  private Double humidityAvg;

  private Double surfaceWetnessAvg;

  private Instant hour;
}
