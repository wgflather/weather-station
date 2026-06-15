package com.flather.weatherstation.dto.projection;

public record DailySummaryProjection(
    Double temperatureMin,
    Double temperatureMax,
    Double temperatureAvg,
    Double pressureMin,
    Double pressureMax,
    Double pressureAvg,
    Double humidityMin,
    Double humidityMax,
    Double humidityAvg,
    Double surfaceWetnessMin,
    Double surfaceWetnessMax,
    Double surfaceWetnessAvg) {}
