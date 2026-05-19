package com.flather.weatherstation.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@ConfigurationProperties(prefix = "timezone")
@Component
@Getter
@Setter
public class TimezoneProperties {
  private String zoneId;
}
