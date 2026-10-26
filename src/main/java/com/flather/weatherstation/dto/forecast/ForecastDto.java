package com.flather.weatherstation.dto.forecast;

import java.time.Instant;
import java.util.List;

/**
 * @param stale true when Open-Meteo is unreachable and this is the last forecast it did return
 * @param fetchedAt when the forecast was fetched, so a stale strip can say how old it is
 */
public record ForecastDto(
    WeatherHourlyUnits units,
    List<WeatherConditionPoint> forecastPoints,
    boolean stale,
    Instant fetchedAt) {}
