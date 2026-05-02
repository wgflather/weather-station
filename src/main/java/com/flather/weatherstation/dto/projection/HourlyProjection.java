package com.flather.weatherstation.dto.projection;

import java.time.Instant;

public record HourlyProjection(Instant hour, Double value) { }
