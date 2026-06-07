package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.SensorStateCache;
import com.flather.weatherstation.config.TimezoneProperties;
import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.dto.validation.ValidationResult;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import java.time.*;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.math3.stat.descriptive.rank.Median;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class WeatherService {
  private final WeatherReportRepository repository;
  private final DataQualityValidator qualityValidator;
  private final WeatherRecordMapper mapper;
  private final TimezoneProperties timezoneProperties;
  private final SensorStateCache sensorStateCache;

  private Double medianOf(Metric metric, Median median) {
    return median.evaluate(
        sensorStateCache.getSpikeWindowSnapshot(metric).stream()
            .mapToDouble(Double::doubleValue)
            .toArray());
  }

  private DataQuality validateIfOk(Metric metric, ValidationResult validationResult, Double value) {

    DataQuality quality = validationResult.getByMetric(metric);

    if (quality.equals(DataQuality.OK)
        && sensorStateCache.getLastSavedMeasurement() == null) {
      return DataQuality.OK;
    }

    return quality == DataQuality.OK ? validateMetric(metric, validationResult, value) : quality;
  }

  private void updateCache(DataQuality dataQuality, Metric metric, Double value) {
    if (dataQuality == DataQuality.OK) {
      sensorStateCache.updateSpikeState(metric, dataQuality, value);
      sensorStateCache.updateCachedMeasurement(metric, value);
    }

    if (dataQuality == DataQuality.SPIKE) {
      sensorStateCache.updateSpikeState(metric, dataQuality, value);
    }
  }

  private DataQuality validateMetric(Metric metric, ValidationResult validation, double value) {
    boolean spike = false;
    DataQuality metricToCheck = validation.getByMetric(metric);

    if (metricToCheck == DataQuality.OK) {

      double median = medianOf(metric, new Median());

      spike =
          qualityValidator.detectDataSpike(
              metric, value, median, sensorStateCache.getLastSavedMeasurement().getMeasuredAt());
    }

    if (spike) {
      return DataQuality.SPIKE;
    }

    return DataQuality.OK;
  }


  @Transactional
  public WeatherRecordResponseDto saveWeatherRecord(WeatherRecordCreatedDto weatherRecordDto) {

    WeatherRecord record = mapper.weatherDtoToEntity(weatherRecordDto);

    ValidationResult anomalyAndMissingValidationResult =
        qualityValidator.detectDataAnomaly(weatherRecordDto);

    DataQuality tempQuality =
        validateIfOk(
            Metric.TEMPERATURE,
            anomalyAndMissingValidationResult,
            weatherRecordDto.getTemperature());

    DataQuality pressureQuality =
        validateIfOk(
            Metric.PRESSURE, anomalyAndMissingValidationResult, weatherRecordDto.getPressure());

    DataQuality humidityQuality =
        validateIfOk(
            Metric.HUMIDITY, anomalyAndMissingValidationResult, weatherRecordDto.getHumidity());


    updateCache(tempQuality, Metric.TEMPERATURE, record.getTemperature());

    record.setTemperatureDataQuality(tempQuality);

    updateCache(pressureQuality, Metric.PRESSURE, record.getPressure());

    record.setPressureDataQuality(pressureQuality);

    updateCache(humidityQuality, Metric.HUMIDITY, record.getHumidity());

    record.setHumidityDataQuality(humidityQuality);

    record.setSurfaceWetnessDataQuality(anomalyAndMissingValidationResult.getByMetric(Metric.SURFACE_WETNESS));

    // ============================
    // persist
    // ============================

    WeatherRecord savedRecord = repository.save(record);

    // ============================
    // metadata update
    // ============================
    sensorStateCache.setLastSavedMeasurement(savedRecord);
    // ============================
    // update general metrics cache
    // ============================
    sensorStateCache.updateCachedMeasurements(savedRecord);

    return mapper.weatherEntityToDto(savedRecord);
  }

  @Transactional(readOnly = true)
  public Optional<WeatherRecordResponseDto> getLatestTodayWeatherRecord() {

    ZoneId zoneId = timezoneProperties.getZoneId();

    LocalDate currentDate = LocalDate.now(zoneId);

    Instant startOfTheCurrentDate = currentDate.atStartOfDay(zoneId).toInstant();

    Instant endOfTheCurrentDate = currentDate.plusDays(1).atStartOfDay(zoneId).toInstant();

    return repository
        .findFirstByMeasuredAtBetweenOrderByMeasuredAtDesc(
            startOfTheCurrentDate, endOfTheCurrentDate)
        .map(mapper::weatherEntityToDto);
  }
}
