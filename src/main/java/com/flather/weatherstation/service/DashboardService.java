package com.flather.weatherstation.service;

import com.flather.weatherstation.model.constant.DataStatus;
import com.flather.weatherstation.model.dto.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.ZonedDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class DashboardService {
    private final AnalyticsService analyticsService;


    public MetricsDashboardDto getMetricsDashboard(){
        WeatherAvgDto averages = analyticsService.getAvgRoundedMetricsData();
        MinMaxValueDto minMaxValueDto = analyticsService.getMinMaxTodayTemperature();
        List<HourlyChartAvgDto> temperatureChartPoints = analyticsService.getHourlyTemperatureChartData();

        return MetricsDashboardDto.builder()
                .averages(averages)
                .minMaxTempValue(minMaxValueDto)
                .temperatureChartPoints(temperatureChartPoints)
                .build();
    }

    public SystemHealthDashboardDto getSystemHealth(){
        ZonedDateTime lastUpdate = analyticsService.findLastRecordTime();
        long todayRecordsCount = analyticsService.findTodayRecordsCount();
        long lagMinutes = analyticsService.getLagMinutes();
        DataStatus dataStatus = DataStatus.fromLag(lagMinutes);

        return SystemHealthDashboardDto.builder()
                .lastMeasuredAt(lastUpdate)
                .recordsToday(todayRecordsCount)
                .status(dataStatus)
                .lagMinutes(lagMinutes)
                .build();
    }

    public WeatherDashboardDto getWeatherDashboard(){
        return WeatherDashboardDto.builder()
                .metricsDashboardDto(getMetricsDashboard())
                .systemHealthDashboardDto(getSystemHealth())
                .build();
    }

}
