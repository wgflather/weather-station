package com.flather.weatherstation.cache;

import com.flather.weatherstation.config.LocationProperties;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.dto.projection.ExtremesProjection;
import com.flather.weatherstation.repository.DateRangeHelper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class SensorCacheInitializer implements ApplicationRunner {
  private final SensorStateCache sensorStateCache;
  private final WeatherReportRepository repository;
  private final LocationProperties properties;

  public SensorCacheInitializer(
      SensorStateCache sensorStateCache,
      WeatherReportRepository repository,
      LocationProperties properties) {
    this.sensorStateCache = sensorStateCache;
    this.repository = repository;
    this.properties = properties;
  }

  @Override
  public void run(ApplicationArguments args) {

    List<WeatherRecord> initRecords =
        repository
            .findByMeasuredAtAfterOrderByMeasuredAtAsc(Instant.now().minus(1, ChronoUnit.HOURS))
            .stream()
            .toList();

    DateRangeHelper.DateRange todayZonedRange =
        DateRangeHelper.getDateRange(properties.getZoneId());

    ExtremesProjection extremesProjection =
        repository.temperatureExtremes(todayZonedRange.startTime(), todayZonedRange.endTime());

    sensorStateCache.loadCacheSnapshot(initRecords, extremesProjection);
  }
}
