package com.flather.weatherstation.dto.configuration;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

public record UpdateValidationRequest(
    @NotNull(message = "tempMinimal is required") Double tempMinimal,
    @NotNull(message = "tempMaximum is required") Double tempMaximum,
    @NotNull(message = "pressureMinimal is required") Double pressureMinimal,
    @NotNull(message = "pressureMaximum is required") Double pressureMaximum,
    /**
     * Must stay above zero. A stored humidity of 0 % is a sensor fault signature rather than a
     * reading, and {@code HourlyWeatherRecordRepository.findLowestDewPointGap} takes {@code LN} of
     * it — Postgres raises on {@code LN(0)} instead of returning an infinity, so one such row fails
     * the query and takes the whole {@code /daily} response down with it, cards and chart together.
     * With this floor a 0 % reading is flagged ANOMALY and the hourly rollup, which averages only
     * {@code OK} rows, never lets it reach {@code humidity_avg}.
     */
    @NotNull(message = "humidityMinimal is required")
        @DecimalMin(
            value = "0",
            inclusive = false,
            message =
                "humidityMinimal must be greater than 0 — a stored 0 % humidity breaks the dew-point query")
        Double humidityMinimal,
    @NotNull(message = "humidityMaximum is required") Double humidityMaximum,
    @NotNull(message = "humiditySpikeLimit is required") Double humiditySpikeLimit,
    @NotNull(message = "tempSpikeLimit is required") Double tempSpikeLimit,
    @NotNull(message = "pressureSpikeLimit is required") Double pressureSpikeLimit,
    @NotNull(message = "surfaceWetnessWetBaseline is required") Integer surfaceWetnessWetBaseline,
    @NotNull(message = "surfaceWetnessDryBaseline is required") Integer surfaceWetnessDryBaseline,
    @NotNull(message = "windMinimal is required") Double windMinimal,
    @NotNull(message = "windMaximum is required") Double windMaximum,
    @NotNull(message = "windSpikeLimit is required") Double windSpikeLimit,
    @NotNull(message = "uvIndexMinimal is required") Double uvIndexMinimal,
    @NotNull(message = "uvIndexMaximum is required") Double uvIndexMaximum,
    @NotNull(message = "uvIndexSpikeLimit is required") Double uvIndexSpikeLimit) {}
