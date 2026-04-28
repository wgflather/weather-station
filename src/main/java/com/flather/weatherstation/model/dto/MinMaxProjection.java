package com.flather.weatherstation.model.dto;

import java.time.Instant;


public record MinMaxProjection(double value, Instant time){}