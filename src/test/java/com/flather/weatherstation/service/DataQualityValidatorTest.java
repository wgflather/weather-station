package com.flather.weatherstation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.config.WeatherValidationConfig;
import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.dto.validation.ValidationResult;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DataQualityValidatorTest {

  @Mock ConfigurationCache properties;
  @InjectMocks DataQualityValidator validator;

  private static final WeatherValidationConfig CONFIG =
      new WeatherValidationConfig(-40, 60, 900, 1100, 0, 100, 20, 5.0, 10.0, 400, 800);

  @BeforeEach
  void setup() {
    given(properties.getValidationConfig()).willReturn(CONFIG);
  }

  // ---- detectDataAnomaly: individual metric cases ----

  @Test
  void nullTemperature_markedMissing() {
    WeatherRecordCreatedDto dto = dto(null, 1013.0, 55.0, 600.0);
    ValidationResult result = validator.detectDataAnomaly(dto);
    assertThat(result.temperature()).isEqualTo(DataQuality.MISSING);
  }

  @Test
  void temperatureBelowMin_markedAnomaly() {
    WeatherRecordCreatedDto dto = dto(-50.0, 1013.0, 55.0, 600.0);
    ValidationResult result = validator.detectDataAnomaly(dto);
    assertThat(result.temperature()).isEqualTo(DataQuality.ANOMALY);
  }

  @Test
  void temperatureAboveMax_markedAnomaly() {
    WeatherRecordCreatedDto dto = dto(100.0, 1013.0, 55.0, 600.0);
    ValidationResult result = validator.detectDataAnomaly(dto);
    assertThat(result.temperature()).isEqualTo(DataQuality.ANOMALY);
  }

  @Test
  void temperatureInRange_markedOk() {
    WeatherRecordCreatedDto dto = dto(20.0, 1013.0, 55.0, 600.0);
    ValidationResult result = validator.detectDataAnomaly(dto);
    assertThat(result.temperature()).isEqualTo(DataQuality.OK);
  }

  @Test
  void nullPressure_markedMissing() {
    WeatherRecordCreatedDto dto = dto(20.0, null, 55.0, 600.0);
    ValidationResult result = validator.detectDataAnomaly(dto);
    assertThat(result.pressure()).isEqualTo(DataQuality.MISSING);
  }

  @Test
  void pressureOutOfRange_markedAnomaly() {
    WeatherRecordCreatedDto dto = dto(20.0, 800.0, 55.0, 600.0);
    ValidationResult result = validator.detectDataAnomaly(dto);
    assertThat(result.pressure()).isEqualTo(DataQuality.ANOMALY);
  }

  @Test
  void nullHumidity_markedMissing() {
    WeatherRecordCreatedDto dto = dto(20.0, 1013.0, null, 600.0);
    ValidationResult result = validator.detectDataAnomaly(dto);
    assertThat(result.humidity()).isEqualTo(DataQuality.MISSING);
  }

  @Test
  void humidityAboveMax_markedAnomaly() {
    WeatherRecordCreatedDto dto = dto(20.0, 1013.0, 110.0, 600.0);
    ValidationResult result = validator.detectDataAnomaly(dto);
    assertThat(result.humidity()).isEqualTo(DataQuality.ANOMALY);
  }

  // ---- detectDataAnomaly: all-valid / all-null ----

  @Test
  void allMetricsValid_allOk() {
    WeatherRecordCreatedDto dto = dto(20.0, 1013.0, 55.0, 600.0);
    ValidationResult result = validator.detectDataAnomaly(dto);
    assertThat(result.temperature()).isEqualTo(DataQuality.OK);
    assertThat(result.pressure()).isEqualTo(DataQuality.OK);
    assertThat(result.humidity()).isEqualTo(DataQuality.OK);
    assertThat(result.surfaceWetness()).isEqualTo(DataQuality.OK);
  }

  @Test
  void allMetricsNull_allMissing() {
    WeatherRecordCreatedDto dto = dto(null, null, null, null);
    ValidationResult result = validator.detectDataAnomaly(dto);
    assertThat(result.temperature()).isEqualTo(DataQuality.MISSING);
    assertThat(result.pressure()).isEqualTo(DataQuality.MISSING);
    assertThat(result.humidity()).isEqualTo(DataQuality.MISSING);
    assertThat(result.surfaceWetness()).isEqualTo(DataQuality.MISSING);
  }

  // ---- detectDataSpike ----

  @Test
  void nullCurrentValue_returnsFalse() {
    assertThat(validator.detectDataSpike(Metric.TEMPERATURE, null, 20.0, Instant.now())).isFalse();
  }

  @Test
  void nullMedianValue_returnsFalse() {
    assertThat(validator.detectDataSpike(Metric.TEMPERATURE, 20.0, null, Instant.now())).isFalse();
  }

  @Test
  void nullLastSavedRecord_returnsFalse() {
    assertThat(validator.detectDataSpike(Metric.TEMPERATURE, 20.0, 20.0, null)).isFalse();
  }

  @Test
  void elapsedOver10Minutes_returnsFalse() {
    Instant old = Instant.now().minus(15, ChronoUnit.MINUTES);
    assertThat(validator.detectDataSpike(Metric.TEMPERATURE, 50.0, 20.0, old)).isFalse();
  }

  @Test
  void withinSpikeLimit_returnsFalse() {
    // spike limit for TEMPERATURE = 5.0; diff = 3 → not a spike
    assertThat(validator.detectDataSpike(Metric.TEMPERATURE, 23.0, 20.0, Instant.now())).isFalse();
  }

  @Test
  void exceedsSpikeLimit_returnsTrue() {
    // spike limit for TEMPERATURE = 5.0; diff = 10 → spike
    assertThat(validator.detectDataSpike(Metric.TEMPERATURE, 30.0, 20.0, Instant.now())).isTrue();
  }

  @Test
  void exceedsPressureSpikeLimit_returnsTrue() {
    // pressure spike limit = 10.0; diff = 15 → spike
    assertThat(validator.detectDataSpike(Metric.PRESSURE, 1030.0, 1013.0, Instant.now())).isTrue();
  }

  @Test
  void withinPressureSpikeLimit_returnsFalse() {
    // pressure spike limit = 10.0; diff = 2 → not a spike
    assertThat(validator.detectDataSpike(Metric.PRESSURE, 1015.0, 1013.0, Instant.now())).isFalse();
  }

  // ---- ValidationLogMessages ----

  @Test
  void missingLogMessage_containsMetricName() {
    String msg = DataQualityValidator.ValidationLogMessages.missing(Metric.TEMPERATURE);
    assertThat(msg).contains("TEMPERATURE").contains("Temperature");
  }

  @Test
  void anomalyLogMessage_containsValueAndUnit() {
    String msg = DataQualityValidator.ValidationLogMessages.anomaly(Metric.PRESSURE, 800.0);
    assertThat(msg).contains("PRESSURE").contains("800").contains("hPa");
  }

  @Test
  void spikeLogMessage_containsMedianAndCurrent() {
    String msg = DataQualityValidator.ValidationLogMessages.spike(Metric.TEMPERATURE, 20.0, 30.0);
    assertThat(msg).contains("TEMPERATURE").contains("20").contains("30");
  }

  // ---- helpers ----

  private WeatherRecordCreatedDto dto(
      Double temp, Double pressure, Double humidity, Double wetness) {
    return WeatherRecordCreatedDto.builder()
        .deviceId("device-1")
        .temperature(temp)
        .pressure(pressure)
        .humidity(humidity)
        .surfaceWetness(wetness)
        .wifiRssi(-60.0)
        .build();
  }
}
