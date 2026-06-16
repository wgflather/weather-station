package com.flather.weatherstation.dto.forecast;

import java.util.List;

public record ForecastDto(WeatherHourlyUnits units, List<WeatherConditionPoint> forecastPoints) {}
