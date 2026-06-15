package com.flather.weatherstation.mapper;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.config.HardwareConfig;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.dto.analytics.MetricDataDetails;
import java.time.ZoneId;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@RequiredArgsConstructor
@Component
public class MetricDataDetailsMapper {

  private final ConfigurationCache configurationCache;

  public MetricDataDetails from(WeatherRecord entity, Metric metric) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();
    HardwareConfig config = configurationCache.getHardwareConfig();
    return switch (metric) {
      case TEMPERATURE ->
          new MetricDataDetails(
              entity.getTemperature(),
              entity.getMeasuredAt().atZone(zoneId),
              entity.getTemperatureDataQuality(),
              config.temperatureSensor(),
              metric.getName());

      case PRESSURE ->
          new MetricDataDetails(
              entity.getPressure(),
              entity.getMeasuredAt().atZone(zoneId),
              entity.getPressureDataQuality(),
              config.pressureSensor(),
              metric.getName());

      case HUMIDITY ->
          new MetricDataDetails(
              entity.getHumidity(),
              entity.getMeasuredAt().atZone(zoneId),
              entity.getHumidityDataQuality(),
              config.humiditySensor(),
              metric.getName());

      case SURFACE_WETNESS ->
          new MetricDataDetails(
              entity.getSurfaceWetness(),
              entity.getMeasuredAt().atZone(zoneId),
              entity.getSurfaceWetnessDataQuality(),
              config.surfaceWetnessSensor(),
              metric.getName());
    };
  }
}
