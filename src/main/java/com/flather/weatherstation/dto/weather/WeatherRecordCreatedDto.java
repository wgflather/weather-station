package com.flather.weatherstation.dto.weather;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.*;

@RequiredArgsConstructor
@AllArgsConstructor
@Builder
@Data
@ToString
public class WeatherRecordCreatedDto {
  @NotNull private String deviceId;

  private Double temperature;

  private Double pressure;

  private Double humidity;

  private Double surfaceWetness;

  @NotNull
  @JsonProperty("WIFI_RSSI")
  private Double wifiRssi;
}
