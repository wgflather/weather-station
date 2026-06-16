package com.flather.weatherstation.dto.forecast;

import java.time.ZonedDateTime;

public record AstroForecastPoint(
    ZonedDateTime time,
    double cloudLow,
    double cloudMid,
    double cloudHigh,
    double windSurface,
    double jetStream,
    double seeingArcsec,
    String seeingLabel,
    int seeingScore) {}
