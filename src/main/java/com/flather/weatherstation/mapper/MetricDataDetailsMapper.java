package com.flather.weatherstation.mapper;

import com.flather.weatherstation.config.HardwareConfig;
import com.flather.weatherstation.config.LocationProperties;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.dto.dashboard.MetricDataDetails;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@RequiredArgsConstructor
@Component
public class MetricDataDetailsMapper {

  private final LocationProperties locationProperties;

  public MetricDataDetails from(WeatherRecord entity, Metric metric, HardwareConfig config) {

    return switch (metric) {
      case TEMPERATURE ->
          new MetricDataDetails(
              entity.getTemperature(),
              entity.getMeasuredAt().atZone(locationProperties.getZoneId()),
              entity.getTemperatureDataQuality(),
              config.getTemperatureSensor(),
              metric.getName());

      case PRESSURE ->
          new MetricDataDetails(
              entity.getPressure(),
              entity.getMeasuredAt().atZone(locationProperties.getZoneId()),
              entity.getPressureDataQuality(),
              config.getPressureSensor(),
              metric.getName());

      case HUMIDITY ->
          new MetricDataDetails(
              entity.getHumidity(),
              entity.getMeasuredAt().atZone(locationProperties.getZoneId()),
              entity.getHumidityDataQuality(),
              config.getHumiditySensor(),
              metric.getName());

      case SURFACE_WETNESS ->
          new MetricDataDetails(
              Optional.ofNullable(entity.getSurfaceWetness()).map(Long::doubleValue).orElse(null),
              entity.getMeasuredAt().atZone(locationProperties.getZoneId()),
              entity.getSurfaceWetnessDataQuality(),
              config.getSurfaceWetnessSensor(),
              metric.getName());
    };
  }
}
