package com.flather.weatherstation.dto.configuration;

import com.flather.weatherstation.domain.entity.StationConfiguration;

public record ConfigurationUpdatedEvent(StationConfiguration configuration) {}
