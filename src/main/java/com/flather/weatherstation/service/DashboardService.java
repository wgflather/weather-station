package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.domain.constant.DataProvider;
import com.flather.weatherstation.domain.constant.DataStatus;
import com.flather.weatherstation.domain.constant.DewPointRisk;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.dto.analytics.HumidityDto;
import com.flather.weatherstation.dto.analytics.PressureDto;
import com.flather.weatherstation.dto.analytics.TemperatureDto;
import com.flather.weatherstation.dto.analytics.UvIndexDto;
import com.flather.weatherstation.dto.analytics.WindDto;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.dashboard.DashboardLiveDto;
import com.flather.weatherstation.dto.dashboard.MetricsDashboardDto;
import com.flather.weatherstation.dto.dashboard.SystemHealthDashboardDto;
import com.flather.weatherstation.util.MeteoMath;
import java.time.Instant;
import java.time.ZonedDateTime;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class DashboardService {
  private final AnalyticsService analyticsService;
  private final WeatherClientService weatherClientService;
  private final AstronomySearch astronomySearchService;
  private final ConfigurationCache configurationCache;

  public MetricsDashboardDto getMetricsDashboard(DataStatus status) {
    var cfg = configurationCache.getDataProviderConfiguration();
    boolean sensorHasData = status != DataStatus.EMPTY;

    TemperatureDto temperature =
        cfg.temperature() == DataProvider.EXTERNAL_API
            ? weatherClientService.getTemperature()
            : sensorHasData ? analyticsService.getTemperature() : null;

    PressureDto pressure =
        cfg.pressure() == DataProvider.EXTERNAL_API
            ? weatherClientService.getPressure()
            : sensorHasData ? analyticsService.getPressure() : null;

    HumidityDto humidity =
        cfg.humidity() == DataProvider.EXTERNAL_API
            ? weatherClientService.getHumidity()
            : sensorHasData ? analyticsService.getHumidity() : null;

    WindDto wind =
        cfg.wind() == DataProvider.EXTERNAL_API
            ? weatherClientService.getWind()
            : sensorHasData ? analyticsService.getWind() : null;

    UvIndexDto uvIndex =
        cfg.uvIndex() == DataProvider.EXTERNAL_API
            ? weatherClientService.getUvIndex()
            : sensorHasData ? analyticsService.getUvIndex() : null;

    // Cross-source dew point: humidity from API, temperature from local sensor (or vice versa).
    // WeatherClientService only computes it when both come from the API; fill the gap here
    // where we have both assembled values regardless of origin.
    if (humidity != null && humidity.dewPoint() == null
        && temperature != null && temperature.value() != null && humidity.value() != null) {
      double dp = MeteoMath.calculateDewPoint(temperature.value(), humidity.value());
      humidity = new HumidityDto(
          humidity.value(), humidity.dataDetails(), dp, DewPointRisk.classify(temperature.value() - dp));
    }

    return MetricsDashboardDto.builder()
        .temperature(temperature)
        .pressure(pressure)
        .surfaceWetness(sensorHasData ? analyticsService.getSurfaceWetness() : null)
        .humidity(humidity)
        .wind(wind)
        .uvIndex(uvIndex)
        .build();
  }

  public ChartDto getChart(Metric metric, String since, int resolution) {
    var cfg = configurationCache.getDataProviderConfiguration();
    DataProvider provider =
        switch (metric) {
          case TEMPERATURE -> cfg.temperature();
          case PRESSURE -> cfg.pressure();
          case HUMIDITY -> cfg.humidity();
          case WIND -> cfg.wind();
          case UV_INDEX -> cfg.uvIndex();
          default -> DataProvider.LOCAL_SENSOR;
        };

    return provider == DataProvider.EXTERNAL_API
        ? weatherClientService.getChart(metric)
        : analyticsService.returnChart(metric, since, resolution);
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
   * Builds the live polling payload: metrics + system health + continuously-changing solar/lunar
   * state, plus the current {@code dailyKey} so the client can detect a midnight or timezone
   * rollover and re-fetch the daily endpoint.
   */
  public DashboardLiveDto getDashboardLive() {
    SystemHealthDashboardDto systemHealth = getSystemHealth();
    MetricsDashboardDto metrics = getMetricsDashboard(systemHealth.getStatus());

    ZonedDateTime time = Instant.now().atZone(configurationCache.getLocationContext().zoneId());
    return new DashboardLiveDto(
        metrics,
        systemHealth,
        astronomySearchService.getSunSnapshot(time),
        astronomySearchService.getMoonSnapshot(time),
        astronomySearchService.dailyKey());
  }
}
