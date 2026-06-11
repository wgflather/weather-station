package com.flather.weatherstation.service;

import com.flather.weatherstation.domain.constant.DataStatus;
import com.flather.weatherstation.dto.dashboard.AstronomySnapshot;
import com.flather.weatherstation.dto.dashboard.MetricsDashboardDto;
import com.flather.weatherstation.dto.dashboard.SystemHealthDashboardDto;
import com.flather.weatherstation.dto.dashboard.WeatherDashboardDto;
import java.time.ZonedDateTime;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class DashboardService {
  private final AnalyticsService analyticsService;
  private final AstronomySearch astronomySearchService;

  public MetricsDashboardDto getMetricsDashboard() {
    return MetricsDashboardDto.builder()
        .temperature(analyticsService.getTemperature())
        .pressure(analyticsService.getPressure())
        .surfaceWetness(analyticsService.getSurfaceWetness())
        .humidity(analyticsService.getHumidity())
        .build();
  }

  public AstronomySnapshot getAstronomyBlock(){
    return new AstronomySnapshot(astronomySearchService.getSun(), astronomySearchService.getMoon());
  }

  public SystemHealthDashboardDto getSystemHealth() {
    ZonedDateTime lastUpdate = analyticsService.findLastRecordTime();
    if (lastUpdate == null) {
      return SystemHealthDashboardDto.builder()
          .status(DataStatus.EMPTY)
          .lagMinutes(0)
          .recordsToday(0)
          .lastMeasuredAt(null)
          .build();
    }

    long todayRecordsCount = analyticsService.findTodayRecordsCount();
    long lagMinutes = analyticsService.getLagMinutes(lastUpdate);
    DataStatus dataStatus = DataStatus.fromLag(lagMinutes);

    return SystemHealthDashboardDto.builder()
        .lastMeasuredAt(lastUpdate)
        .recordsToday(todayRecordsCount)
        .status(dataStatus)
        .lagMinutes(lagMinutes)
        .build();
  }

  public WeatherDashboardDto getWeatherDashboard() {
    SystemHealthDashboardDto systemHealthDashboardDto = getSystemHealth();
    AstronomySnapshot astronomyDashboardBlock = getAstronomyBlock();
    MetricsDashboardDto metricsDashboardDto =
        (systemHealthDashboardDto.getStatus() == DataStatus.EMPTY)
            ? MetricsDashboardDto.empty()
            : getMetricsDashboard();

    return WeatherDashboardDto.builder()
        .metricsDashboardDto(metricsDashboardDto)
        .systemHealthDashboardDto(systemHealthDashboardDto)
            .astronomySnapshot(astronomyDashboardBlock)
        .build();
  }
}
