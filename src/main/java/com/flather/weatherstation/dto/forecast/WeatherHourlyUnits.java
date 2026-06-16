package com.flather.weatherstation.dto.forecast;

import com.fasterxml.jackson.annotation.JsonProperty;

public record WeatherHourlyUnits(
    @JsonProperty("cloud_cover") String cloudCover,
    @JsonProperty("precipitation_probability") String precipitationProbability,
    @JsonProperty("rain") String rain,
    @JsonProperty("showers") String showers,
    @JsonProperty("snowfall") String snowfall) {}
