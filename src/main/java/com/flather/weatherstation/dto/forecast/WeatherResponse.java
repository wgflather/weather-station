package com.flather.weatherstation.dto.forecast;

import com.fasterxml.jackson.annotation.JsonProperty;

public record WeatherResponse(
    @JsonProperty("hourly") WeatherConditionsForecast hourly,
    @JsonProperty("hourly_units") WeatherHourlyUnits units) {}
