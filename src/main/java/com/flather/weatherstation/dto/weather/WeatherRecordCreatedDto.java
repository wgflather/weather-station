package com.flather.weatherstation.dto.weather;

import lombok.*;

@RequiredArgsConstructor
@AllArgsConstructor
@Builder
@Data
@ToString
public class WeatherRecordCreatedDto {

  private String deviceId;

  private double temperature;

  private double pressure;
}
