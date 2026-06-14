package com.flather.weatherstation.dto.weather;

import lombok.*;

@RequiredArgsConstructor
@AllArgsConstructor
@Builder
@Data
@ToString
public class WeatherRecordCreatedDto {

  private String deviceId;

  private Double temperature;

  private Double pressure;

  private Double humidity;

  private Double surfaceWetness;

  private double WIFI_RSSI;
}
