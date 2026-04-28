package com.flather.weatherstation.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@ConfigurationProperties(prefix = "mqtt")
@Component
@Getter
@Setter
public class MqttConfig {
    private String host;
    private String client;
}
