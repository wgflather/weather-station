package com.flather.weatherstation.domain.constant;

import lombok.Getter;

import java.util.Arrays;

@Getter
public enum Metric {
    TEMPERATURE("temperature", "Temperature"),
    PRESSURE("pressure", "Pressure"),
    HUMIDITY("humidity", "Humidity"),
    SURFACE_WETNESS("surfaceWetness", "Surface Wetness");

    private final String apiKey;
    private final String name;

    Metric(String apiKey, String name){
        this.apiKey = apiKey;
        this.name = name;
    }

    public static Metric fromApiKey(String apiKey){
        return Arrays.stream(Metric.values())
                .filter(m -> m.apiKey.equals(apiKey))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown Metric"));
    }
}
