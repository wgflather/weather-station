package com.flather.weatherstation.dto.configuration;

import com.flather.weatherstation.config.HardwareConfig;
import com.flather.weatherstation.config.LocationContext;
import com.flather.weatherstation.config.WeatherValidationConfig;

public record StationConfigurationResponse(
    LocationContext location, WeatherValidationConfig validation, HardwareConfig hardware) {}
