package com.flather.weatherstation.dto.configuration;

import jakarta.validation.constraints.NotNull;

public record UpdateHardwareRequest(
    @NotNull(message = "board is required") String board,
    String temperatureSensor,
    String humiditySensor,
    String pressureSensor,
    String surfaceWetnessSensor,
    String windSensor,
    String uvIndexSensor) {}
