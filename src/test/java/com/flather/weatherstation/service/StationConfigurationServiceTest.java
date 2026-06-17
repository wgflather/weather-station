package com.flather.weatherstation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.config.HardwareConfig;
import com.flather.weatherstation.config.LocationContext;
import com.flather.weatherstation.config.WeatherValidationConfig;
import com.flather.weatherstation.domain.entity.StationConfiguration;
import com.flather.weatherstation.domain.event.ConfigurationUpdatedEvent;
import com.flather.weatherstation.dto.configuration.*;
import com.flather.weatherstation.repository.StationConfigurationRepository;
import java.time.ZoneId;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

@ExtendWith(MockitoExtension.class)
class StationConfigurationServiceTest {

  @Mock StationConfigurationRepository stationConfigurationRepository;
  @Mock ApplicationEventPublisher eventPublisher;
  @Mock ConfigurationCache configurationCache;
  @InjectMocks StationConfigurationService service;

  // ---- getConfiguration ----

  @Test
  void getConfiguration_returnsEntity_whenExists() {
    StationConfiguration cfg = new StationConfiguration();
    cfg.setLatitude(52.5);
    given(stationConfigurationRepository.findById(1L)).willReturn(Optional.of(cfg));

    StationConfiguration result = service.getConfiguration();

    assertThat(result.getLatitude()).isEqualTo(52.5);
  }

  @Test
  void getConfiguration_throwsIllegalState_whenNotFound() {
    given(stationConfigurationRepository.findById(1L)).willReturn(Optional.empty());

    assertThatThrownBy(() -> service.getConfiguration())
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("Station configuration not found");
  }

  // ---- getConfigurationView ----

  @Test
  void getConfigurationView_returnsFromCache() {
    LocationContext location = new LocationContext(52.5, 13.4, 34.0, ZoneId.of("UTC"), null);
    WeatherValidationConfig validation =
        new WeatherValidationConfig(
            -40, 60, 900, 1100, 0, 100, 20, 5.0, 10.0, 400, 800, 0.0, 60.0, 20.0, 0.0, 16.0, 5.0);
    HardwareConfig hardware =
        new HardwareConfig("RPi", "DS18B20", "DHT22", "BMP180", null, null, null);

    given(configurationCache.getLocationContext()).willReturn(location);
    given(configurationCache.getValidationConfig()).willReturn(validation);
    given(configurationCache.getHardwareConfig()).willReturn(hardware);

    StationConfigurationResponse result = service.getConfigurationView();

    assertThat(result.location().latitude()).isEqualTo(52.5);
    assertThat(result.hardware().board()).isEqualTo("RPi");
    assertThat(result.validation().tempMaximum()).isEqualTo(60);
  }

  // ---- updateLocation ----

  @Test
  void updateLocation_updatesFieldsAndPublishesEvent() {
    StationConfiguration existing = new StationConfiguration();
    existing.setLatitude(0.0);
    existing.setLongitude(0.0);
    given(stationConfigurationRepository.findById(1L)).willReturn(Optional.of(existing));
    given(stationConfigurationRepository.save(any())).willAnswer(inv -> inv.getArgument(0));

    UpdateLocationRequest request = new UpdateLocationRequest(13.4, 52.5, 100.0);
    StationConfiguration result = service.updateLocation(request);

    assertThat(result.getLatitude()).isEqualTo(52.5);
    assertThat(result.getLongitude()).isEqualTo(13.4);
    assertThat(result.getElevation()).isEqualTo(100.0);

    ArgumentCaptor<ConfigurationUpdatedEvent> eventCaptor =
        ArgumentCaptor.forClass(ConfigurationUpdatedEvent.class);
    verify(eventPublisher).publishEvent(eventCaptor.capture());
    assertThat(eventCaptor.getValue().configuration().getLatitude()).isEqualTo(52.5);
  }

  // ---- updateValidation ----

  @Test
  void updateValidation_updatesAllValidationFields() {
    StationConfiguration existing = new StationConfiguration();
    given(stationConfigurationRepository.findById(1L)).willReturn(Optional.of(existing));
    given(stationConfigurationRepository.save(any())).willAnswer(inv -> inv.getArgument(0));

    UpdateValidationRequest request =
        new UpdateValidationRequest(
            -40.0, 60.0, 900.0, 1100.0, 0.0, 100.0, 20.0, 5.0, 10.0, 400, 800, 0.0, 60.0, 20.0, 0.0,
            16.0, 5.0);

    StationConfiguration result = service.updateValidation(request);

    assertThat(result.getTempMinimal()).isEqualTo(-40.0);
    assertThat(result.getTempMaximum()).isEqualTo(60.0);
    assertThat(result.getPressureMinimal()).isEqualTo(900.0);
    assertThat(result.getPressureMaximum()).isEqualTo(1100.0);
    assertThat(result.getHumidityMinimal()).isEqualTo(0.0);
    assertThat(result.getHumidityMaximum()).isEqualTo(100.0);
    assertThat(result.getSurfaceWetnessWetBaseline()).isEqualTo(400);
    assertThat(result.getSurfaceWetnessDryBaseline()).isEqualTo(800);
    verify(eventPublisher).publishEvent(any(ConfigurationUpdatedEvent.class));
  }

  // ---- updateHardware ----

  @Test
  void updateHardware_updatesAllHardwareFields() {
    StationConfiguration existing = new StationConfiguration();
    given(stationConfigurationRepository.findById(1L)).willReturn(Optional.of(existing));
    given(stationConfigurationRepository.save(any())).willAnswer(inv -> inv.getArgument(0));

    UpdateHardwareRequest request =
        new UpdateHardwareRequest(
            "Raspberry Pi", "DS18B20", "DHT22", "BMP180", "YL-69", null, null);

    StationConfiguration result = service.updateHardware(request);

    assertThat(result.getBoard()).isEqualTo("Raspberry Pi");
    assertThat(result.getTemperatureSensor()).isEqualTo("DS18B20");
    assertThat(result.getHumiditySensor()).isEqualTo("DHT22");
    assertThat(result.getPressureSensor()).isEqualTo("BMP180");
    assertThat(result.getSurfaceWetnessSensor()).isEqualTo("YL-69");
    verify(eventPublisher).publishEvent(any(ConfigurationUpdatedEvent.class));
  }
}
