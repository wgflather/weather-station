package com.flather.weatherstation.service;

import com.flather.weatherstation.domain.entity.StationConfiguration;
import com.flather.weatherstation.dto.configuration.ConfigurationUpdatedEvent;
import com.flather.weatherstation.dto.configuration.UpdateLocationRequest;
import com.flather.weatherstation.repository.StationConfigurationRepository;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class StationConfigurationService {
  private final StationConfigurationRepository stationConfigurationRepository;
  private final ApplicationEventPublisher eventPublisher;

  public StationConfiguration getConfiguration() {
    return stationConfigurationRepository
        .findById(1L)
        .orElseThrow(() -> new IllegalStateException("Station configuration not found"));
  }

  @Transactional
  public StationConfiguration updateLocation(UpdateLocationRequest request) {
    StationConfiguration cfg = getConfiguration();

    cfg.setLatitude(request.lat());
    cfg.setLongitude(request.lon());
    cfg.setElevation(request.elevation());

    return persistAndRefreshCache(cfg);
  }

  private StationConfiguration persistAndRefreshCache(StationConfiguration cfg) {
    StationConfiguration savedCfg = stationConfigurationRepository.save(cfg);
    eventPublisher.publishEvent(new ConfigurationUpdatedEvent(cfg));
    return savedCfg;
  }
}
