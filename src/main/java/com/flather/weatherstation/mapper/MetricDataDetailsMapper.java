package com.flather.weatherstation.mapper;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.config.HardwareConfig;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.dto.dashboard.MetricDataDetails;
import java.time.ZoneId;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@RequiredArgsConstructor
@Component
public class MetricDataDetailsMapper {

  private final ConfigurationCache configurationCache;

  public MetricDataDetails from(WeatherRecord entity, Metric metric, HardwareConfig config) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();
    return switch (metric) {
      case TEMPERATURE ->
          new MetricDataDetails(
              entity.getTemperature(),
              entity.getMeasuredAt().atZone(zoneId),
              entity.getTemperatureDataQuality(),
              config.getTemperatureSensor(),
              metric.getName());

      case PRESSURE ->
          new MetricDataDetails(
              entity.getPressure(),
              entity.getMeasuredAt().atZone(zoneId),
              entity.getPressureDataQuality(),
              config.getPressureSensor(),
              metric.getName());

      case HUMIDITY ->
          new MetricDataDetails(
              entity.getHumidity(),
              entity.getMeasuredAt().atZone(zoneId),
              entity.getHumidityDataQuality(),
              config.getHumiditySensor(),
              metric.getName());

      case SURFACE_WETNESS ->
          new MetricDataDetails(
              Optional.ofNullable(entity.getSurfaceWetness()).map(Long::doubleValue).orElse(null),
              entity.getMeasuredAt().atZone(zoneId),
              entity.getSurfaceWetnessDataQuality(),
              config.getSurfaceWetnessSensor(),
              metric.getName());
    };
  }
}
