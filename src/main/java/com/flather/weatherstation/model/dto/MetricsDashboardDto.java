package com.flather.weatherstation.model.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;

import java.util.List;

@Builder
@Data
@AllArgsConstructor
@RequiredArgsConstructor
public class MetricsDashboardDto {
    private WeatherAvgDto averages;
    private MinMaxValueDto minMaxTempValue;
    private List<HourlyChartAvgDto> temperatureChartPoints;
}
