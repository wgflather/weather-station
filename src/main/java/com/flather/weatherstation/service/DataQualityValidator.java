package com.flather.weatherstation.service;

import com.flather.weatherstation.config.WeatherValidationProperties;
import com.flather.weatherstation.dto.projection.MedianProjection;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.domain.constant.DataQuality;
import java.time.Duration;
import java.time.Instant;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class DataQualityValidator {

  private final WeatherValidationProperties properties;

  public boolean detectDataAnomaly(WeatherRecordCreatedDto anomalyDto) {
    boolean isAnomaly = false; // Anomaly represents unrealistic data connected to sensor failures

    if (anomalyDto.getTemperature() == null || anomalyDto.getTemperature() < properties.getTempMinimal()
            || anomalyDto.getTemperature() > properties.getTempMaximum()) {
      log.warn(
              "[DATA_ANOMALY][TEMP] Temperature is unrealistic: {} ℃",
              anomalyDto.getTemperature());
      isAnomaly = true;
    }

    if (anomalyDto.getPressure() < properties.getPressureMinimal()
            || anomalyDto.getPressure() > properties.getPressureMaximum()) {
      log.warn(
              "[DATA_ANOMALY][PRESSURE] Pressure is unrealistic: {} hPa",
              anomalyDto.getPressure());
      isAnomaly = true;
    }

    if (anomalyDto.getHumidity() == null || anomalyDto.getHumidity()  < properties.getHumidityMinimal()
            || anomalyDto.getHumidity() > properties.getHumidityMaximum()) {
      log.warn(
              "[DATA_ANOMALY][HUMIDITY] Humidity is unrealistic: {} %",
              anomalyDto.getHumidity());
      isAnomaly = true;
    }

    return isAnomaly;
  }

  public boolean detectDataSpike(
          WeatherRecordCreatedDto weatherRecordDto,
          Instant lastSavedRecord,
          MedianProjection median) {

    if (median == null || lastSavedRecord == null) return false;

    long elapsed = Duration.between(lastSavedRecord, Instant.now()).toMinutes();

    if (elapsed >= 10) return false;

    double newTemp = weatherRecordDto.getTemperature();
    double newPressure = weatherRecordDto.getPressure();
    double newHumidity = weatherRecordDto.getHumidity();

    boolean isSpike = false; // Spike represents a sharp jump in data values

    if (Math.abs(newTemp - median.temp()) > properties.getTempSpikeLimit()) {
      log.warn(
              "[DATA_SPIKE][TEMP] Last 5 temp reads median: {} ℃ Current temp read: {} ℃",
              median.temp(),
              weatherRecordDto.getTemperature());
      isSpike = true;
    }

    if (Math.abs(newPressure - median.pressure()) > properties.getPressureSpikeLimit()) {
      log.warn(
              "[DATA_SPIKE][PRESSURE] Last 5 pressure reads median: {} hPa Current pressure read: {} hPa",
              median.pressure(),
              weatherRecordDto.getPressure());
      isSpike = true;
    }

    if (Math.abs(newHumidity - median.humidity()) > properties.getHumiditySpikeLimit()) {
      log.warn(
              "[DATA_SPIKE][HUMIDITY] Last 5 humidity reads median: {} % Current humidity read: {} %",
              median.humidity(),
              weatherRecordDto.getHumidity());
      isSpike = true;
    }

    return isSpike;
  }

  public DataQuality determineDataQualityStatus(boolean anomaly, boolean spike) {
    if (anomaly) return DataQuality.ANOMALY;
    if (spike) return DataQuality.SPIKE;
    return DataQuality.OK;
  }
}
