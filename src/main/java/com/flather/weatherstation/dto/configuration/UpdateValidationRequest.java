package com.flather.weatherstation.dto.configuration;

import jakarta.validation.constraints.NotNull;

public record UpdateValidationRequest(
    @NotNull(message = "tempMinimal is required") Double tempMinimal,
    @NotNull(message = "tempMaximum is required") Double tempMaximum,
    @NotNull(message = "pressureMinimal is required") Double pressureMinimal,
    @NotNull(message = "pressureMaximum is required") Double pressureMaximum,
    @NotNull(message = "humidityMinimal is required") Double humidityMinimal,
    @NotNull(message = "humidityMaximum is required") Double humidityMaximum,
    @NotNull(message = "humiditySpikeLimit is required") Double humiditySpikeLimit,
    @NotNull(message = "tempSpikeLimit is required") Double tempSpikeLimit,
    @NotNull(message = "pressureSpikeLimit is required") Double pressureSpikeLimit,
    @NotNull(message = "surfaceWetnessWetBaseline is required") Integer surfaceWetnessWetBaseline,
    @NotNull(message = "surfaceWetnessDryBaseline is required")
        Integer surfaceWetnessDryBaseline) {}
