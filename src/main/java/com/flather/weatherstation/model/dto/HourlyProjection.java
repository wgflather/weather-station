package com.flather.weatherstation.model.dto;

import java.time.Instant;

public record HourlyProjection(Instant hour, Double value) { }
