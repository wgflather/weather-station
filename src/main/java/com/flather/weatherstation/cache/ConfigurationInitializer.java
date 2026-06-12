package com.flather.weatherstation.cache;

import com.flather.weatherstation.domain.entity.StationConfiguration;
import com.flather.weatherstation.service.StationConfigurationService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ConfigurationInitializer {

  private final StationConfigurationService service;
  private final ConfigurationCache cache;

  @PostConstruct
  public void init() {
    StationConfiguration cfg = service.getConfiguration();
    cache.apply(cfg);
  }
}
