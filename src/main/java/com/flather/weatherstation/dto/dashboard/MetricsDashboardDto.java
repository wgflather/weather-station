package com.flather.weatherstation.dto.dashboard;

import com.flather.weatherstation.dto.analytics.*;
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
    private TemperatureDto temperature;
    private PressureDto pressure;
    private List<HourlyChartAvgDto> temperatureChartPoints;
    private TrendResult temperatureTrend;
    private TrendResult pressureTrend;

    public static MetricsDashboardDto empty(){
        return MetricsDashboardDto.builder()
                .temperatureChartPoints(Collections.emptyList())
                .build();
    }
}
