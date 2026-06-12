package com.flather.weatherstation.cache;

import com.flather.weatherstation.config.HardwareConfig;
import com.flather.weatherstation.config.LocationContext;
import com.flather.weatherstation.config.WeatherValidationConfig;
import com.flather.weatherstation.domain.entity.StationConfiguration;
import com.flather.weatherstation.mapper.StationConfigurationMapper;
import com.flather.weatherstation.service.StationConfigurationService;
import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ConfigurationCache {
  private final StationConfigurationService stationConfigurationService;
  private final StationConfigurationMapper mapper;

  @Getter private volatile LocationContext locationContext;

  @Getter private volatile WeatherValidationConfig validationConfig;

  @Getter private volatile HardwareConfig hardwareConfig;

  @PostConstruct
  void init() {
    reload();
  }

  public synchronized void reload() {
    StationConfiguration cfg = stationConfigurationService.getConfiguration();

    apply(cfg);
  }

  public void apply(StationConfiguration cfg) {
    locationContext = mapper.toLocationContext(cfg);
    validationConfig = mapper.toValidationConfig(cfg);
    hardwareConfig = mapper.toHardwareConfig(cfg);
  }
}
