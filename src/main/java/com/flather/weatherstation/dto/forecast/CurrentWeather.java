package com.flather.weatherstation.dto.forecast;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;

public record CurrentWeather(
    @JsonProperty("time") LocalDateTime time,
    @JsonProperty("temperature_2m") Double temperature,
    @JsonProperty("wind_speed_10m") Double windSpeed,
    @JsonProperty("wind_gusts_10m") Double windGusts,
    @JsonProperty("wind_direction_10m") Double windDirection,
    @JsonProperty("relative_humidity_2m") Double humidity,
    @JsonProperty("surface_pressure") Double pressure,
    @JsonProperty("uv_index") Double uvIndex) {}
