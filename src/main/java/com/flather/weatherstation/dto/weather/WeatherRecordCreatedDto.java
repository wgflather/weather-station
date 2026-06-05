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

  private double pressure;

  private Double humidity;

  private double WIFI_RSSI;
}
