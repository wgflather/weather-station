package com.flather.weatherstation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.*;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.cache.SensorStateCache;
import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.dto.validation.ValidationResult;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.openapitools.jackson.nullable.JsonNullable;

@ExtendWith(MockitoExtension.class)
class WeatherServiceTest {

  @Mock WeatherReportRepository repository;
  @Mock DataQualityValidator qualityValidator;
  @Mock WeatherRecordMapper mapper;
  @Mock ConfigurationCache configurationCache;
  @Mock SensorStateCache sensorStateCache;
  @InjectMocks WeatherService service;

  private WeatherRecordCreatedDto dto;
  private WeatherRecord entity;
  private WeatherRecord savedRecord;
  private WeatherRecordResponseDto responseDto;

  @BeforeEach
  void setup() {
    dto =
        WeatherRecordCreatedDto.builder()
            .deviceId("device-1")
            .temperature(JsonNullable.of(22.0))
            .pressure(JsonNullable.of(1013.0))
            .humidity(JsonNullable.of(55.0))
            .wifiRssi(-60.0)
            .build();

    entity =
        WeatherRecord.builder()
            .deviceId("device-1")
            .temperature(22.0)
            .pressure(1013.0)
            .humidity(55.0)
            .build();

    savedRecord = WeatherRecord.builder().id(1L).temperature(22.0).pressure(1013.0).build();
    savedRecord.setMeasuredAt(Instant.now());

    responseDto = WeatherRecordResponseDto.builder().temperature(22.0).pressure(1013.0).build();

    given(mapper.weatherDtoToEntity(dto)).willReturn(entity);
    given(repository.save(entity)).willReturn(savedRecord);
    given(mapper.weatherEntityToDto(savedRecord)).willReturn(responseDto);
  }

  @Test
  void firstRecord_noHistory_allQualitiesOk() {
    given(qualityValidator.detectDataAnomaly(dto)).willReturn(allOk());
    given(sensorStateCache.getLastSavedMeasurement()).willReturn(null);

    WeatherRecordResponseDto result = service.saveWeatherRecord(dto);

    assertThat(result).isSameAs(responseDto);
    assertThat(entity.getTemperatureDataQuality()).isEqualTo(DataQuality.OK);
    assertThat(entity.getPressureDataQuality()).isEqualTo(DataQuality.OK);
    assertThat(entity.getHumidityDataQuality()).isEqualTo(DataQuality.OK);
    verify(repository).save(entity);
  }

  @Test
  void anomalyTemperature_setsAnomalyQuality() {
    given(qualityValidator.detectDataAnomaly(dto))
        .willReturn(
            new ValidationResult(
                DataQuality.ANOMALY,
                DataQuality.OK,
                DataQuality.OK,
                DataQuality.OK,
                DataQuality.OK,
                DataQuality.OK,
                DataQuality.OK));
    given(sensorStateCache.getLastSavedMeasurement()).willReturn(null);

    service.saveWeatherRecord(dto);

    assertThat(entity.getTemperatureDataQuality()).isEqualTo(DataQuality.ANOMALY);
    assertThat(entity.getPressureDataQuality()).isEqualTo(DataQuality.OK);
  }

  @Test
  void missingHumidity_setsMissingQuality() {
    given(qualityValidator.detectDataAnomaly(dto))
        .willReturn(
            new ValidationResult(
                DataQuality.OK,
                DataQuality.OK,
                DataQuality.MISSING,
                DataQuality.OK,
                DataQuality.OK,
                DataQuality.OK,
                DataQuality.OK));
    given(sensorStateCache.getLastSavedMeasurement()).willReturn(null);

    service.saveWeatherRecord(dto);

    assertThat(entity.getHumidityDataQuality()).isEqualTo(DataQuality.MISSING);
  }

  @Test
  void spikeTemperature_setsSpikeQuality() {
    WeatherRecord previousRecord = WeatherRecord.builder().build();
    previousRecord.setMeasuredAt(Instant.now());

    given(qualityValidator.detectDataAnomaly(dto)).willReturn(allOk());
    given(sensorStateCache.getLastSavedMeasurement()).willReturn(previousRecord);
    given(sensorStateCache.getSpikeWindowSnapshot(Metric.TEMPERATURE))
        .willReturn(List.of(20.0, 20.0, 20.0));
    given(sensorStateCache.getSpikeWindowSnapshot(Metric.PRESSURE))
        .willReturn(List.of(1013.0, 1013.0, 1013.0));
    given(sensorStateCache.getSpikeWindowSnapshot(Metric.HUMIDITY))
        .willReturn(List.of(55.0, 55.0, 55.0));
    given(qualityValidator.detectDataSpike(eq(Metric.TEMPERATURE), any(), any(), any()))
        .willReturn(true);
    given(qualityValidator.detectDataSpike(eq(Metric.PRESSURE), any(), any(), any()))
        .willReturn(false);
    given(qualityValidator.detectDataSpike(eq(Metric.HUMIDITY), any(), any(), any()))
        .willReturn(false);

    service.saveWeatherRecord(dto);

    assertThat(entity.getTemperatureDataQuality()).isEqualTo(DataQuality.SPIKE);
    assertThat(entity.getPressureDataQuality()).isEqualTo(DataQuality.OK);
  }

  @Test
  void saveRecord_persistsAndUpdatesLastMeasurement() {
    given(qualityValidator.detectDataAnomaly(dto)).willReturn(allOk());
    given(sensorStateCache.getLastSavedMeasurement()).willReturn(null);

    service.saveWeatherRecord(dto);

    verify(repository).save(entity);
    verify(sensorStateCache).setLastSavedMeasurement(savedRecord);
    verify(sensorStateCache).updateCachedMeasurements(savedRecord);
  }

  @Test
  void okQuality_updatesBothSpikeStateAndMeasurement() {
    given(qualityValidator.detectDataAnomaly(dto)).willReturn(allOk());
    given(sensorStateCache.getLastSavedMeasurement()).willReturn(null);

    service.saveWeatherRecord(dto);

    verify(sensorStateCache).updateSpikeState(Metric.TEMPERATURE, DataQuality.OK, 22.0);
    verify(sensorStateCache).updateCachedMeasurement(Metric.TEMPERATURE, 22.0);
  }

  @Test
  void anomalyQuality_doesNotUpdateSpikeOrMeasurementCache() {
    given(qualityValidator.detectDataAnomaly(dto))
        .willReturn(
            new ValidationResult(
                DataQuality.ANOMALY,
                DataQuality.OK,
                DataQuality.OK,
                DataQuality.OK,
                DataQuality.OK,
                DataQuality.OK,
                DataQuality.OK));
    given(sensorStateCache.getLastSavedMeasurement()).willReturn(null);

    service.saveWeatherRecord(dto);

    verify(sensorStateCache, never())
        .updateSpikeState(eq(Metric.TEMPERATURE), any(DataQuality.class), anyDouble());
    verify(sensorStateCache, never()).updateCachedMeasurement(eq(Metric.TEMPERATURE), anyDouble());
  }

  // ---- helpers ----

  private ValidationResult allOk() {
    return new ValidationResult(
        DataQuality.OK,
        DataQuality.OK,
        DataQuality.OK,
        DataQuality.OK,
        DataQuality.OK,
        DataQuality.OK,
        DataQuality.OK);
  }
}
