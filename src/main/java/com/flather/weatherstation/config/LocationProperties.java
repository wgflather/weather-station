package com.flather.weatherstation.config;

import io.github.cosinekitty.astronomy.Observer;
import jakarta.annotation.PostConstruct;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.time.ZoneId;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.validation.annotation.Validated;
import us.dustinj.timezonemap.TimeZone;
import us.dustinj.timezonemap.TimeZoneMap;

@Slf4j
@ConfigurationProperties(prefix = "location")
@Component
@Getter
@Validated
public class LocationProperties {

  @DecimalMin(value = "-90.0", message = "location.latitude must be between -90 and 90 degrees")
  @DecimalMax(value = "90.0", message = "location.latitude must be between -90 and 90 degrees")
  @Setter
  @NotNull(message = "location.latitude is required")
  private Double latitude;

  @DecimalMin(value = "-180.0", message = "location.longitude must be between -180 and 180 degrees")
  @DecimalMax(value = "180.0", message = "location.longitude must be between -180 and 180 degrees")
  @Setter
  @NotNull(message = "location.longitude is required")
  private Double longitude;

  @DecimalMin(value = "-430.0", message = "Elevation must be above sea level limits")
  @DecimalMax(value = "8850.0", message = "Elevation must be realistic (below Everest range)")
  @Setter
  private Double elevation;

  private Observer observer;

  @Getter private ZoneId zoneId;

  @PostConstruct
  private void initLocationProperties() {

    // Initialize for the entire world map
    TimeZoneMap map = TimeZoneMap.forEverywhere();

    // Get the ZoneId object
    TimeZone zone = map.getOverlappingTimeZone(latitude, longitude);
    if(elevation == null){
      log.info("Elevation not set, fall to default 0.0");
      elevation = 0.0;
    }

    if (zone == null) {
      throw new RuntimeException();
    }

    this.zoneId = ZoneId.of(zone.getZoneId());

    if ("Etc/GMT".equals(zone.getZoneId())) {
      log.warn(
          "Coordinates ({}, {}) resolved to {}. Verify configuration if this is unexpected.",
          latitude,
          longitude,
          zone.getZoneId());
    }

    log.info("Resolved timezone {} for coordinates ({}, {}) with {}m elevation", zoneId, latitude, longitude, elevation);



    observer = new Observer(latitude, longitude, elevation);
  }
}
