package com.flather.weatherstation.dto.configuration;

import com.flather.weatherstation.domain.constant.DataProvider;
import jakarta.validation.constraints.NotNull;

public record UpdateDataProviderRequest(
    @NotNull DataProvider temperature,
    @NotNull DataProvider pressure,
    @NotNull DataProvider humidity,
    @NotNull DataProvider wind,
    @NotNull DataProvider uvIndex) {}
