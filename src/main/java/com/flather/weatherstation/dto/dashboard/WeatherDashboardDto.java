package com.flather.weatherstation.dto.dashboard;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;

@Data
@AllArgsConstructor
@RequiredArgsConstructor
@Builder
public class WeatherDashboardDto {
    private MetricsDashboardDto metricsDashboardDto;
    private SystemHealthDashboardDto systemHealthDashboardDto;
}
