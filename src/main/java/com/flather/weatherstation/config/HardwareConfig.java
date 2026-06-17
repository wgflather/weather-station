package com.flather.weatherstation.config;

public record HardwareConfig(
    String board,
    String temperatureSensor,
    String humiditySensor,
    String pressureSensor,
    String surfaceWetnessSensor,
    String windSensor,
    String uvIndexSensor) {}
