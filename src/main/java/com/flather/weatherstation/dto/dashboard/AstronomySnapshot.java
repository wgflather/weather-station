package com.flather.weatherstation.dto.dashboard;

import com.flather.weatherstation.dto.astronomy.Moon;
import com.flather.weatherstation.dto.astronomy.Sun;

public record AstronomySnapshot(Sun sun, Moon moon) {
}
