package com.flather.weatherstation.dto.forecast;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDateTime;
import java.util.List;

public record WeatherConditionsForecast(
        List<LocalDateTime> time,
        @JsonProperty("cloud_cover")
        List<Double> totalCloudCoverage,
        @JsonProperty("precipitation_probability")
        List<Double> precipitationProbability,
        @JsonProperty("rain")
        List<Double> rainAmount,
        @JsonProperty("showers")
        List<Double> showerAmount,
        @JsonProperty("snowfall")
        List<Double> snowFallAmount) {
}
