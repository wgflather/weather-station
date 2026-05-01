package com.flather.weatherstation.model.dto;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Builder
@Data
public class MetricsDashboardDto {
    private WeatherAvgDto averages;
    private MinMaxValueDto minMaxTempValue;
    private List<HourlyChartAvgDto> temperatureChartPoints;
}
