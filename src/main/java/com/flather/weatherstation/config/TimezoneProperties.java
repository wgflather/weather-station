package com.flather.weatherstation.config;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.stereotype.Component;

import java.time.ZoneId;


@ConfigurationProperties(prefix = "timezone")
@Component
@Getter
@Setter
public class TimezoneProperties {
    private String zoneId;
}
