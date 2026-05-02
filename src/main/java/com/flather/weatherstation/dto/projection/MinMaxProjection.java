package com.flather.weatherstation.dto.projection;

import java.time.Instant;


public record MinMaxProjection(double value, Instant time){}