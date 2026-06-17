package com.flather.weatherstation.dto.astronomy;

import com.flather.weatherstation.domain.constant.DailyCurveResolution;
import java.util.List;

public record AstronomyCurveDto(
    CelestialBody body, DailyCurveResolution resolution, List<AstronomyPoint> points) {}
