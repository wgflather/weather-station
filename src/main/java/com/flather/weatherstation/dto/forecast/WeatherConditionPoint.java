package com.flather.weatherstation.dto.forecast;

import java.time.ZonedDateTime;

public record WeatherConditionPoint(
    ZonedDateTime time,
    Integer weatherCode, // Open-Meteo: weather_code (WMO code)
    Double cloudCover, // Open-Meteo: cloud_cover (%)
    Double cloudCoverLow, // Open-Meteo: cloud_cover_low (%) — surface to ~3 km
    Double cloudCoverMid, // Open-Meteo: cloud_cover_mid (%) — ~3 km to ~8 km
    Double cloudCoverHigh, // Open-Meteo: cloud_cover_high (%) — above ~8 km (cirrus)
    Double precipitationChance, // Open-Meteo: precipitation_probability (%)
    Double rainAmount, // Open-Meteo: rain (mm)
    Double snowAmount, // Open-Meteo: snowfall (cm)
    Double showersAmount, // Open-Meteo: showers (mm)
    // Metric fields — null when that metric is on LOCAL_SENSOR (not requested from API)
    Double temperature, // Open-Meteo: temperature_2m (°C)
    Double humidity, // Open-Meteo: relative_humidity_2m (%)
    Double pressure, // Open-Meteo: surface_pressure (hPa)
    Double windSpeed, // Open-Meteo: wind_speed_10m (m/s)
    Double windGusts, // Open-Meteo: wind_gusts_10m (m/s)
    Double uvIndex // Open-Meteo: uv_index
    ) {}
