package com.flather.weatherstation.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@ConfigurationProperties(prefix = "mqtt")
@Getter
@Setter
@Component
public class MqttProperties {
    private String host;
    private String clientId;
}
