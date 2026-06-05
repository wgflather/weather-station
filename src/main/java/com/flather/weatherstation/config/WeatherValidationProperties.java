package com.flather.weatherstation.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@ConfigurationProperties(prefix = "weather.validation")
@Component
@Getter
@Setter
public class WeatherValidationProperties {
  private int tempMinimal;
  private int tempMaximum;
  private int pressureMinimal;
  private int pressureMaximum;
  private int humidityMinimal;
  private int humidityMaximum;
  private int humiditySpikeLimit;
  private double tempSpikeLimit;
  private double pressureSpikeLimit;
}
