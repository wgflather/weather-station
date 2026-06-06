package com.flather.weatherstation.domain.constant;

import lombok.Getter;

import java.util.Arrays;

@Getter
public enum Metric {
    TEMPERATURE("temperature", "Temperature", "℃"),
    PRESSURE("pressure", "Pressure", "hPa"),
    HUMIDITY("humidity", "Humidity", "%"),
    SURFACE_WETNESS("surfaceWetness", "Surface Wetness", "%");

    private final String apiKey;
    private final String name;
    private final String unit;

    Metric(String apiKey, String name, String unit){
        this.apiKey = apiKey;
        this.name = name;
        this.unit = unit;
    }

    public static Metric fromApiKey(String apiKey){
        return Arrays.stream(Metric.values())
                .filter(m -> m.apiKey.equals(apiKey))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown Metric"));
    }
}
