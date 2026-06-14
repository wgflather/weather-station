package com.flather.weatherstation.dto.astronomy;

import java.time.ZonedDateTime;

public record AstronomyPoint(
        ZonedDateTime time,
        double altitude
) {}
