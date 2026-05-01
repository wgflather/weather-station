package com.flather.weatherstation.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;

import java.math.BigDecimal;

@Data
@AllArgsConstructor
@RequiredArgsConstructor
@Builder
public class WeatherAvgDto {
    private Double avgTemperature;
    private Double avgPressure;
}
