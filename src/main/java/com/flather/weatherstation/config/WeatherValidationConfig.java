package com.flather.weatherstation.config;

public record WeatherValidationConfig(
    int tempMinimal,
    int tempMaximum,
    int pressureMinimal,
    int pressureMaximum,
    int humidityMinimal,
    int humidityMaximum,
    int humiditySpikeLimit,
    double tempSpikeLimit,
    double pressureSpikeLimit,
    int surfaceWetnessWetBaseline,
    int surfaceWetnessDryBaseline) {}
