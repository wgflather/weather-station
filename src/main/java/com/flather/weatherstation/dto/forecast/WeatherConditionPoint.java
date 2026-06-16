package com.flather.weatherstation.dto.forecast;

import java.time.ZonedDateTime;

public record WeatherConditionPoint(
        ZonedDateTime time,
        Double cloudCover,             // Open-Meteo: cloud_cover (%)
        Double precipitationChance,    // Open-Meteo: precipitation_probability (%)
        Double rainAmount,              // Open-Meteo: rain (mm)
        Double snowAmount,              // Open-Meteo: snowfall (cm)
        Double showersAmount            // Open-Meteo: showers (mm)
){}