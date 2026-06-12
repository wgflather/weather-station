package com.flather.weatherstation.mapper;

import com.flather.weatherstation.config.LocationContext;
import com.flather.weatherstation.config.WeatherValidationConfig;
import com.flather.weatherstation.domain.entity.StationConfiguration;
import io.github.cosinekitty.astronomy.Observer;
import java.time.ZoneId;
import org.springframework.stereotype.Component;
import us.dustinj.timezonemap.TimeZone;
import us.dustinj.timezonemap.TimeZoneMap;

@Component
public class StationConfigurationMapper {

  public WeatherValidationConfig toValidationConfig(StationConfiguration cfg) {
    return new WeatherValidationConfig(
        cfg.getTempMinimal().intValue(),
        cfg.getTempMaximum().intValue(),
        cfg.getPressureMinimal().intValue(),
        cfg.getPressureMaximum().intValue(),
        cfg.getHumidityMinimal().intValue(),
        cfg.getHumidityMaximum().intValue(),
        cfg.getHumiditySpikeLimit().intValue(),
        cfg.getTempSpikeLimit(),
        cfg.getPressureSpikeLimit(),
        cfg.getSurfaceWetnessWetBaseline(),
        cfg.getSurfaceWetnessDryBaseline());
  }

  public LocationContext toLocationContext(StationConfiguration cfg) {
    double elevation = cfg.getElevation() == null ? 0.0 : cfg.getElevation();

    TimeZoneMap map = TimeZoneMap.forEverywhere();

    TimeZone zone = map.getOverlappingTimeZone(cfg.getLatitude(), cfg.getLongitude());

    if (zone == null) {
      throw new IllegalStateException("Unable to resolve timezone");
    }

    ZoneId zoneId = ZoneId.of(zone.getZoneId());

    return new LocationContext(
        cfg.getLatitude(),
        cfg.getLongitude(),
        elevation,
        zoneId,
        new Observer(cfg.getLatitude(), cfg.getLongitude(), elevation));
  }
}
