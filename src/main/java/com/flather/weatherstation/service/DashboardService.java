package com.flather.weatherstation.service;

import com.flather.weatherstation.dto.dashboard.MetricsDashboardDto;
import com.flather.weatherstation.dto.dashboard.SystemHealthDashboardDto;
import com.flather.weatherstation.dto.dashboard.WeatherDashboardDto;
import com.flather.weatherstation.model.constant.DataStatus;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.ZonedDateTime;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class DashboardService {
    private final AnalyticsService analyticsService;


    public MetricsDashboardDto getMetricsDashboard(){
       return MetricsDashboardDto.builder()
               .temperature(analyticsService.getTemperature())
               .temperatureChartPoints(analyticsService.getHourlyTemperatureChartData())
               .build();
    }

    public SystemHealthDashboardDto getSystemHealth(){
        Optional<ZonedDateTime> lastUpdate = analyticsService.findLastRecordTime();
        if(lastUpdate.isEmpty()){
            return SystemHealthDashboardDto.builder()
                    .status(DataStatus.EMPTY)
                    .lagMinutes(0)
                    .recordsToday(0)
                    .lastMeasuredAt(null)
                    .build();
        }

        ZonedDateTime last = lastUpdate.get();
        long todayRecordsCount = analyticsService.findTodayRecordsCount();
        long lagMinutes = analyticsService.getLagMinutes(last);
        DataStatus dataStatus = DataStatus.fromLag(lagMinutes);

        return SystemHealthDashboardDto.builder()
                .lastMeasuredAt(last)
                .recordsToday(todayRecordsCount)
                .status(dataStatus)
                .lagMinutes(lagMinutes)
                .build();
    }

    public WeatherDashboardDto getWeatherDashboard() {
        SystemHealthDashboardDto systemHealthDashboardDto = getSystemHealth();
        MetricsDashboardDto metricsDashboardDto = (systemHealthDashboardDto.getStatus() == DataStatus.EMPTY) ?
                MetricsDashboardDto.empty()
                : getMetricsDashboard();


        return WeatherDashboardDto
                .builder()
                .metricsDashboardDto(metricsDashboardDto)
                .systemHealthDashboardDto(systemHealthDashboardDto)
                .build();
    }

}
