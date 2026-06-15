package com.flather.weatherstation.domain.event;

import com.flather.weatherstation.domain.entity.StationConfiguration;

public record ConfigurationUpdatedEvent(StationConfiguration configuration) {}
