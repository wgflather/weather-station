package com.flather.weatherstation.cache;

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
  private final ConfigurationCache properties;

  public SensorCacheInitializer(
      SensorStateCache sensorStateCache,
      WeatherReportRepository repository,
      ConfigurationCache configurationCache) {
    this.sensorStateCache = sensorStateCache;
    this.repository = repository;
    this.properties = configurationCache;
  }

  @Override
  public void run(ApplicationArguments args) {

    List<WeatherRecord> initRecords =
        repository
            .findByMeasuredAtAfterOrderByMeasuredAtAsc(Instant.now().minus(1, ChronoUnit.HOURS))
            .stream()
            .toList();

    DateRangeHelper.DateRange todayZonedRange =
        DateRangeHelper.getDateRange(properties.getLocationContext().zoneId());

    ExtremesProjection extremesProjection =
        repository.temperatureExtremes(todayZonedRange.startTime(), todayZonedRange.endTime());

    sensorStateCache.loadCacheSnapshot(initRecords, extremesProjection);
  }
}
