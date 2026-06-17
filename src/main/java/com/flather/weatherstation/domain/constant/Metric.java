package com.flather.weatherstation.domain.constant;

import java.util.Arrays;
import java.util.List;
import lombok.Getter;

@Getter
public enum Metric {
  TEMPERATURE("temperature", "Temperature", "℃", List.of("temperature_2m")),

  PRESSURE("pressure", "Pressure", "hPa", List.of("surface_pressure")),

  HUMIDITY("humidity", "Humidity", "%", List.of("relative_humidity_2m")),

  SURFACE_WETNESS("surfaceWetness", "Surface Wetness", "%", null),

  WIND("wind", "Wind", "m/s", List.of("wind_speed_10m", "wind_gusts_10m", "wind_direction_10m")),

  WIND_DIRECTION("windDirection", "Wind Direction", "°", List.of("wind_direction_10m")),

  UV_INDEX("uvIndex", "UV Index", "UV index", List.of("uv_index"));

  private final String requestKey;
  private final String name;
  private final String unit;
  private final List<String> providerKeys;

  Metric(String apiKey, String name, String unit, List<String> providerKeys) {
    this.requestKey = apiKey;
    this.name = name;
    this.unit = unit;
    this.providerKeys = providerKeys;
  }

  public static Metric fromRequestKey(String requestKey) {
    return Arrays.stream(Metric.values())
        .filter(m -> m.requestKey.equals(requestKey))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Unknown Metric"));
  }
}
