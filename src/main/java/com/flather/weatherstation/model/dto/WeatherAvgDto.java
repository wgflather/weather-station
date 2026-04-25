package com.flather.weatherstation.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;

@Data
@AllArgsConstructor
@RequiredArgsConstructor
@Builder
public class WeatherAvgDto {
    private Double avgTemperature;
    private Double avgPressure;
}
