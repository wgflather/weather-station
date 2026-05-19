package com.flather.weatherstation.dto.projection;

import java.time.Instant;

public record DataPoint(Instant hour, Double value) {}
