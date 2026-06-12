package com.flather.weatherstation.config;

import static com.flather.weatherstation.domain.constant.Metric.*;

public record HardwareConfig(
    String board,
    String temperatureSensor,
    String humiditySensor,
    String pressureSensor,
    String surfaceWetnessSensor) {}
