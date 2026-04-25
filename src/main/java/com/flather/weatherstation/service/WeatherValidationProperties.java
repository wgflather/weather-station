package com.flather.weatherstation.service;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@ConfigurationProperties(prefix = "weather.validation")
@Component
@Data
public class WeatherValidationProperties {
    private int tempMinimal;
    private int tempMaximum;
    private int pressureMinimal;
    private int pressureMaximum;
    private double tempSpikeLimit;
    private double pressureSpikeLimit;
}
