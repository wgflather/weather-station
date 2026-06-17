package com.flather.weatherstation.dto.forecast;

import java.time.ZonedDateTime;

public record WeatherConditionPoint(
    ZonedDateTime time,
    Integer weatherCode, // Open-Meteo: weather_code (WMO code)
    Double cloudCover, // Open-Meteo: cloud_cover (%)
    Double precipitationChance, // Open-Meteo: precipitation_probability (%)
    Double rainAmount, // Open-Meteo: rain (mm)
    Double snowAmount, // Open-Meteo: snowfall (cm)
    Double showersAmount // Open-Meteo: showers (mm)
    ) {}
