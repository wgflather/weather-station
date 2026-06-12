package com.flather.weatherstation.config;

import io.github.cosinekitty.astronomy.Observer;
import java.time.ZoneId;

public record LocationContext(
    Double latitude, Double longitude, Double elevation, ZoneId zoneId, Observer observer) {}
