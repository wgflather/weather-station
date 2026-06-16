package com.flather.weatherstation.dto.forecast;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.LocalDateTime;
import java.util.List;

public record WeatherConditionsForecast(
    List<LocalDateTime> time,
    @JsonProperty("cloud_cover") List<Double> totalCloudCoverage,
    @JsonProperty("cloud_cover_low") List<Double> cloudCoverLow,
    @JsonProperty("cloud_cover_mid") List<Double> cloudCoverMid,
    @JsonProperty("cloud_cover_high") List<Double> cloudCoverHigh,
    @JsonProperty("precipitation_probability") List<Double> precipitationProbability,
    @JsonProperty("rain") List<Double> rainAmount,
    @JsonProperty("showers") List<Double> showerAmount,
    @JsonProperty("snowfall") List<Double> snowFallAmount,
    @JsonProperty("wind_speed_10m") List<Double> windSpeed10m,
    @JsonProperty("wind_speed_200hPa") List<Double> windSpeed200hPa) {}
