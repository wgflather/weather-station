package com.flather.weatherstation.service;

import com.flather.weatherstation.config.WeatherValidationProperties;
import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.dto.validation.ValidationResult;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class DataQualityValidator {

  private final WeatherValidationProperties properties;

  private void validateMetric(
      Metric metric, Double value, double min, double max, Map<Metric, DataQuality> result) {

    if (value == null) {
      log.warn(ValidationLogMessages.missing(metric));
      result.put(metric, DataQuality.MISSING);
      return;
    }

    if (value < min || value > max) {
      log.warn(ValidationLogMessages.anomaly(metric, value));
      result.put(metric, DataQuality.ANOMALY);
      return;
    }

    result.put(metric, DataQuality.OK);
  }

  public ValidationResult detectDataAnomaly(WeatherRecordCreatedDto anomalyDto) {

    Map<Metric, DataQuality> dataQualityMap = new HashMap<>();

    validateMetric(
        Metric.TEMPERATURE,
        anomalyDto.getTemperature(),
        properties.getTempMinimal(),
        properties.getTempMaximum(),
        dataQualityMap);

    validateMetric(
        Metric.PRESSURE,
        anomalyDto.getPressure(),
        properties.getPressureMinimal(),
        properties.getPressureMaximum(),
        dataQualityMap);

    validateMetric(
        Metric.HUMIDITY,
        anomalyDto.getHumidity(),
        properties.getHumidityMinimal(),
        properties.getHumidityMaximum(),
        dataQualityMap);

    validateMetric(
        Metric.SURFACE_WETNESS,
        Optional.ofNullable(anomalyDto.getSurfaceWetness()).map(Long::doubleValue).orElse(null),
        properties.getSurfaceWetnessWetBaseline(),
        properties.getSurfaceWetnessDryBaseline(),
        dataQualityMap);

    return new ValidationResult(
        dataQualityMap.get(Metric.TEMPERATURE),
        dataQualityMap.get(Metric.PRESSURE),
        dataQualityMap.get(Metric.HUMIDITY),
        dataQualityMap.get(Metric.SURFACE_WETNESS));
  }

  private double getSpikeLimit(Metric metric) {
    return switch (metric) {
      case TEMPERATURE -> properties.getTempSpikeLimit();
      case PRESSURE -> properties.getPressureSpikeLimit();
      case HUMIDITY -> properties.getHumiditySpikeLimit();
      default -> throw new IllegalArgumentException("Unknown Metric");
    };
  }

  public boolean detectDataSpike(
      Metric metric, Double currentValue, Double medianValue, Instant lastSavedRecord) {

    if (currentValue == null || medianValue == null || lastSavedRecord == null) {
      return false;
    }

    long elapsed = Duration.between(lastSavedRecord, Instant.now()).toMinutes();

    if (elapsed >= 10) {
      return false;
    }

    double spikeLimit = getSpikeLimit(metric);

    if (Math.abs(currentValue - medianValue) > spikeLimit) {

      log.warn(ValidationLogMessages.spike(metric, medianValue, currentValue));

      return true;
    }

    return false;
  }

  public static final class ValidationLogMessages {

    private ValidationLogMessages() {}

    public static String missing(Metric metric) {
      return String.format(
          "[DATA_MISSING][%s] %s is missing", metric.getName().toUpperCase(), metric.getName());
    }

    public static String anomaly(Metric metric, double value) {

      return String.format(
          "[DATA_ANOMALY][%s] %s is unrealistic: %.2f %s",
          metric.getName().toUpperCase(), metric.getName(), value, metric.getUnit());
    }

    public static String spike(Metric metric, double median, double currentValue) {

      return String.format(
          "[DATA_SPIKE][%s] Last 5 reads median: %.2f %s Current read: %.2f %s",
          metric.getName().toUpperCase(), median, metric.getUnit(), currentValue, metric.getUnit());
    }
  }
}
