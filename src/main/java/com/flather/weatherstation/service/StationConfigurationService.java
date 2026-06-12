package com.flather.weatherstation.service;

import com.flather.weatherstation.domain.entity.StationConfiguration;
import com.flather.weatherstation.repository.StationConfigurationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class StationConfigurationService {
  private final StationConfigurationRepository stationConfigurationRepository;

  public StationConfiguration getConfiguration() {
    return stationConfigurationRepository
        .findById(1L)
        .orElseThrow(() -> new IllegalStateException("Station configuration not found"));
  }
}
