package com.flather.weatherstation.dto.astronomy;

import java.time.ZonedDateTime;

public record MoonDto(

        ZonedDateTime rise,
        ZonedDateTime set,

        TransitDto peak,              // max altitude + time

        double currentAltitude,
        double distanceKm,

        MoonPhaseDto phase,

        String constellation

) {}
