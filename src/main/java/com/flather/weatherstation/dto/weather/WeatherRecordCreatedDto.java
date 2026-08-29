package com.flather.weatherstation.dto.weather;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;
import lombok.*;
import org.openapitools.jackson.nullable.JsonNullable;

@RequiredArgsConstructor
@AllArgsConstructor
@Builder
@Data
@ToString
public class WeatherRecordCreatedDto {
  @NotNull private String deviceId;
  private JsonNullable<Double> temperature;

  private JsonNullable<Double> pressure;

  private JsonNullable<Double> humidity;

  private JsonNullable<Double> surfaceWetness;

  private JsonNullable<Double> wind;

  @JsonProperty("wind_direction")
  private JsonNullable<Double> windDirection;

  @JsonProperty("uv_index")
  private JsonNullable<Double> uvIndex;

  @NotNull
  @JsonProperty("WIFI_RSSI")
  private Double wifiRssi;
}
