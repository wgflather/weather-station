package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.domain.constant.DataStatus;
import com.flather.weatherstation.dto.dashboard.AstronomyDailyEventsDto;
import com.flather.weatherstation.dto.dashboard.DashboardLiveDto;
import com.flather.weatherstation.dto.dashboard.MetricsDashboardDto;
import com.flather.weatherstation.dto.dashboard.SystemHealthDashboardDto;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.Optional;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class DashboardService {
  private final AnalyticsService analyticsService;
  private final AstronomySearch astronomySearchService;
  private final ConfigurationCache configurationCache;

  public MetricsDashboardDto getMetricsDashboard() {
    return MetricsDashboardDto.builder()
        .temperature(analyticsService.getTemperature())
        .pressure(analyticsService.getPressure())
        .surfaceWetness(analyticsService.getSurfaceWetness())
        .humidity(analyticsService.getHumidity())
        .build();
  }

  public SystemHealthDashboardDto getSystemHealth() {
    Optional<ZonedDateTime> lastUpdateOptional = analyticsService.findLastRecordTime();

    if (lastUpdateOptional.isEmpty()) {
      return SystemHealthDashboardDto.builder()
          .status(DataStatus.EMPTY)
          .lagMinutes(0)
          .recordsToday(0)
          .lastMeasuredAt(null)
          .build();
    }

    ZonedDateTime lastUpdate = lastUpdateOptional.get();

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

  /**
   * Builds the once-per-day astronomy payload. The two underlying methods are {@code @Cacheable}
   * and keyed by {@code dailyKey()}, so this call is essentially free after the first hit of the
   * day (or after a runtime timezone change).
   */
  public AstronomyDailyEventsDto getAstronomyDailyEvents() {
    return new AstronomyDailyEventsDto(
        astronomySearchService.getSunDailyEvents(),
        astronomySearchService.getMoonDailyEvents(),
        astronomySearchService.dailyKey());
  }

  /**
   * Builds the live polling payload: metrics + system health + continuously-changing solar/lunar
   * state, plus the current {@code dailyKey} so the client can detect a midnight or timezone
   * rollover and re-fetch the daily endpoint.
   */
  public DashboardLiveDto getDashboardLive() {
    SystemHealthDashboardDto systemHealth = getSystemHealth();
    MetricsDashboardDto metrics =
        (systemHealth.getStatus() == DataStatus.EMPTY)
            ? MetricsDashboardDto.empty()
            : getMetricsDashboard();

    ZonedDateTime time = Instant.now().atZone(configurationCache.getLocationContext().zoneId());
    return new DashboardLiveDto(
        metrics,
        systemHealth,
        astronomySearchService.getSunSnapshot(time),
        astronomySearchService.getMoonSnapshot(time),
        astronomySearchService.dailyKey());
  }
}
