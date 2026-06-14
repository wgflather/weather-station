package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.domain.entity.StationConfiguration;
import com.flather.weatherstation.dto.configuration.*;
import com.flather.weatherstation.mapper.StationConfigurationMapper;
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
  private final StationConfigurationMapper mapper;

  public StationConfiguration getConfiguration() {
    return stationConfigurationRepository
        .findById(1L)
        .orElseThrow(() -> new IllegalStateException("Station configuration not found"));
  }

  public StationConfigurationResponse getConfigurationView() {

    return new StationConfigurationResponse(
        configurationCache.getLocationContext(),
        configurationCache.getValidationConfig(),
        configurationCache.getHardwareConfig());
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

    return persistAndRefreshCache(cfg);
  }

  private StationConfiguration persistAndRefreshCache(StationConfiguration cfg) {
    StationConfiguration savedCfg = stationConfigurationRepository.save(cfg);
    eventPublisher.publishEvent(new ConfigurationUpdatedEvent(savedCfg));
    return savedCfg;
  }
}
