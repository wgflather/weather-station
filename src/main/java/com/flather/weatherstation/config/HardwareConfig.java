package com.flather.weatherstation.config;

import com.flather.weatherstation.domain.constant.Metric;
import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.function.Supplier;

import static com.flather.weatherstation.domain.constant.Metric.*;

@ConfigurationProperties(prefix = "hardware")
@Component
@Getter
@Setter
public class HardwareConfig {
    private String board;
    private String temperatureSensor;
    private String humiditySensor;
    private String pressureSensor;
    private String surfaceWetnessSensor;

    private Map<Metric, Supplier<String>> sensorResolvers;

    @PostConstruct
    public void init() {
        sensorResolvers = Map.of(
                Metric.TEMPERATURE, () -> temperatureSensor,
                Metric.PRESSURE, () -> pressureSensor,
                Metric.HUMIDITY, () -> humiditySensor,
                Metric.SURFACE_WETNESS, () -> surfaceWetnessSensor
        );
    }


    private String format(String sensor) {
        if (sensor == null || sensor.isBlank()) {
            return board;
        }
        return sensor + "/" + board;
    }

    public String getHardwareByMetric(Metric metric) {
        String sensor = sensorResolvers.getOrDefault(metric, () -> null).get();
        return format(sensor);
    }
}
