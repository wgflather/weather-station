package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.domain.entity.StationConfiguration;
import com.flather.weatherstation.domain.event.ConfigurationUpdatedEvent;
import com.flather.weatherstation.dto.configuration.StationConfigurationResponse;
import com.flather.weatherstation.dto.configuration.UpdateDataProviderRequest;
import com.flather.weatherstation.dto.configuration.UpdateHardwareRequest;
import com.flather.weatherstation.dto.configuration.UpdateLocationRequest;
import com.flather.weatherstation.dto.configuration.UpdateValidationRequest;
import com.flather.weatherstation.repository.StationConfigurationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class StationConfigurationService {
  private final StationConfigurationRepository stationConfigurationRepository;
  private final ApplicationEventPublisher eventPublisher;
  private final ConfigurationCache configurationCache;

  public StationConfiguration getConfiguration() {
    return stationConfigurationRepository
        .findById(1L)
        .orElseThrow(() -> new IllegalStateException("Station configuration not found"));
  }

  public StationConfigurationResponse getConfigurationView() {
    return new StationConfigurationResponse(
        configurationCache.getLocationContext(),
        configurationCache.getValidationConfig(),
        configurationCache.getHardwareConfig(),
        configurationCache.getDataProviderConfiguration());
  }

  @Transactional
  public StationConfiguration updateLocation(UpdateLocationRequest request) {
    StationConfiguration cfg = getConfiguration();

    cfg.setLatitude(request.lat());
    cfg.setLongitude(request.lon());
    cfg.setElevation(request.elevation());

    return persistAndRefreshCache(cfg);
  }

  @Transactional
  public StationConfiguration updateValidation(UpdateValidationRequest request) {

    StationConfiguration cfg = getConfiguration();

    cfg.setTempMinimal(request.tempMinimal());
    cfg.setTempMaximum(request.tempMaximum());

    cfg.setPressureMinimal(request.pressureMinimal());
    cfg.setPressureMaximum(request.pressureMaximum());

    cfg.setHumidityMinimal(request.humidityMinimal());
    cfg.setHumidityMaximum(request.humidityMaximum());

    cfg.setHumiditySpikeLimit(request.humiditySpikeLimit());

    cfg.setTempSpikeLimit(request.tempSpikeLimit());
    cfg.setPressureSpikeLimit(request.pressureSpikeLimit());

    cfg.setSurfaceWetnessWetBaseline(request.surfaceWetnessWetBaseline());
    cfg.setSurfaceWetnessDryBaseline(request.surfaceWetnessDryBaseline());

    cfg.setWindMinimal(request.windMinimal());
    cfg.setWindMaximum(request.windMaximum());
    cfg.setWindSpikeLimit(request.windSpikeLimit());
    cfg.setUvIndexMinimal(request.uvIndexMinimal());
    cfg.setUvIndexMaximum(request.uvIndexMaximum());
    cfg.setUvIndexSpikeLimit(request.uvIndexSpikeLimit());

    return persistAndRefreshCache(cfg);
  }

  @Transactional
  public StationConfiguration updateHardware(UpdateHardwareRequest request) {
    StationConfiguration cfg = getConfiguration();

    cfg.setBoard(request.board());
    cfg.setTemperatureSensor(request.temperatureSensor());
    cfg.setHumiditySensor(request.humiditySensor());
    cfg.setPressureSensor(request.pressureSensor());
    cfg.setSurfaceWetnessSensor(request.surfaceWetnessSensor());
    cfg.setWindSensor(request.windSensor());
    cfg.setUvIndexSensor(request.uvIndexSensor());

    return persistAndRefreshCache(cfg);
  }

  @Transactional
  public StationConfiguration updateDataProviders(UpdateDataProviderRequest request) {
    StationConfiguration cfg = getConfiguration();

    cfg.setTemperatureProvider(request.temperature());
    cfg.setPressureProvider(request.pressure());
    cfg.setHumidityProvider(request.humidity());
    cfg.setWindProvider(request.wind());
    cfg.setUvIndexProvider(request.uvIndex());

    return persistAndRefreshCache(cfg);
  }

  private StationConfiguration persistAndRefreshCache(StationConfiguration cfg) {
    StationConfiguration savedCfg = stationConfigurationRepository.save(cfg);
    eventPublisher.publishEvent(new ConfigurationUpdatedEvent(savedCfg));
    return savedCfg;
  }
}
