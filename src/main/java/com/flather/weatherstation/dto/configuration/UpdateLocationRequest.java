package com.flather.weatherstation.dto.configuration;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

public record UpdateLocationRequest(
    @NotNull(message = "longitude is required")
        @DecimalMin(value = "-180.0", message = "longitude must be >= -180")
        @DecimalMax(value = "180.0", message = "longitude must be <= 180")
        Double lon,
    @NotNull(message = "latitude is required")
        @DecimalMin(value = "-90.0", message = "latitude must be >= -90")
        @DecimalMax(value = "90.0", message = "latitude must be <= 90")
        Double lat,
    @DecimalMin(value = "-430.0", message = "elevation must be realistic")
        @DecimalMax(value = "8850.0", message = "elevation must be realistic")
        Double elevation) {}
