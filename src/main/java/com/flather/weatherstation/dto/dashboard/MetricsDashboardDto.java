package com.flather.weatherstation.dto.dashboard;

import com.flather.weatherstation.dto.analytics.HourlyChartAvgDto;
import com.flather.weatherstation.dto.analytics.MinMaxValueDto;
import com.flather.weatherstation.dto.analytics.WeatherAvgDto;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;

import java.util.Collections;
import java.util.List;

@Builder
@Data
@AllArgsConstructor
@RequiredArgsConstructor
public class MetricsDashboardDto {
    private WeatherAvgDto averages;
    private MinMaxValueDto minMaxTempValue;
    private List<HourlyChartAvgDto> temperatureChartPoints;

    public static MetricsDashboardDto empty(){
        return MetricsDashboardDto.builder()
                .temperatureChartPoints(Collections.emptyList())
                .build();
    }
}
