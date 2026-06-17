package com.flather.weatherstation.mapper;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.config.HardwareConfig;
import com.flather.weatherstation.domain.constant.DataProvider;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.dto.analytics.MetricDataDetails;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@RequiredArgsConstructor
@Component
public class MetricDataDetailsMapper {

  private static final DateTimeFormatter DISPLAY_FMT =
      DateTimeFormatter.ofPattern("dd/MM/yyyy, HH:mm:ss");

  private final ConfigurationCache configurationCache;

  private String fmt(ZonedDateTime zdt) {
    return zdt == null ? null : zdt.format(DISPLAY_FMT);
  }

  public MetricDataDetails from(WeatherRecord entity, Metric metric) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();
    HardwareConfig config = configurationCache.getHardwareConfig();
    String measuredAt = fmt(entity.getMeasuredAt().atZone(zoneId));
    return switch (metric) {
      case TEMPERATURE ->
          new MetricDataDetails(
              entity.getTemperature(),
              measuredAt,
              entity.getTemperatureDataQuality(),
              config.temperatureSensor(),
              metric.getName(),
              DataProvider.LOCAL_SENSOR);

      case PRESSURE ->
          new MetricDataDetails(
              entity.getPressure(),
              measuredAt,
              entity.getPressureDataQuality(),
              config.pressureSensor(),
              metric.getName(),
              DataProvider.LOCAL_SENSOR);

      case HUMIDITY ->
          new MetricDataDetails(
              entity.getHumidity(),
              measuredAt,
              entity.getHumidityDataQuality(),
              config.humiditySensor(),
              metric.getName(),
              DataProvider.LOCAL_SENSOR);

      case SURFACE_WETNESS ->
          new MetricDataDetails(
              entity.getSurfaceWetness(),
              measuredAt,
              entity.getSurfaceWetnessDataQuality(),
              config.surfaceWetnessSensor(),
              metric.getName(),
              DataProvider.LOCAL_SENSOR);

      case WIND ->
          new MetricDataDetails(
              entity.getWind(),
              measuredAt,
              entity.getWindDataQuality(),
              config.windSensor(),
              metric.getName(),
              DataProvider.LOCAL_SENSOR);

      case WIND_DIRECTION ->
          new MetricDataDetails(
              entity.getWindDirection(),
              measuredAt,
              entity.getWindDirectionDataQuality(),
              config.windSensor(),
              metric.getName(),
              DataProvider.LOCAL_SENSOR);

      case UV_INDEX ->
          new MetricDataDetails(
              entity.getUvIndex(),
              measuredAt,
              entity.getUvIndexDataQuality(),
              config.uvIndexSensor(),
              metric.getName(),
              DataProvider.LOCAL_SENSOR);
    };
  }

  public MetricDataDetails fromApi(Metric metric, Double value, ZonedDateTime fetchedAt) {
    return new MetricDataDetails(
        value, fmt(fetchedAt), null, null, metric.getName(), DataProvider.EXTERNAL_API);
  }
}
