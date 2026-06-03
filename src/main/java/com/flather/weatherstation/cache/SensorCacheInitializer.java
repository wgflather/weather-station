package com.flather.weatherstation.cache;

import com.flather.weatherstation.config.TimezoneProperties;
import com.flather.weatherstation.dto.projection.ExtremesProjection;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
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
  private final TimezoneProperties properties;
  private final WeatherRecordMapper mapper;

  public SensorCacheInitializer(
      SensorStateCache sensorStateCache,
      WeatherReportRepository repository,
      TimezoneProperties properties,
      WeatherRecordMapper mapper) {
    this.sensorStateCache = sensorStateCache;
    this.repository = repository;
    this.properties = properties;
    this.mapper = mapper;
  }

  @Override
  public void run(ApplicationArguments args) {

    List<WeatherRecordResponseDto> initRecords =
        repository
            .findByMeasuredAtAfterOrderByMeasuredAtAsc(Instant.now().minus(1, ChronoUnit.HOURS))
            .stream()
            .map(mapper::weatherEntityToDto)
            .toList();

    DateRangeHelper.DateRange todayZonedRange =
        DateRangeHelper.getDateRange(properties.getZoneId());

    ExtremesProjection extremesProjection =
        repository.temperatureExtremes(todayZonedRange.startTime(), todayZonedRange.endTime());

    sensorStateCache.loadCacheSnapshot(initRecords, extremesProjection);
  }
}
