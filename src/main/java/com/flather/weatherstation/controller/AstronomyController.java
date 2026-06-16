package com.flather.weatherstation.controller;

import com.flather.weatherstation.domain.constant.CelestialBody;
import com.flather.weatherstation.domain.constant.DailyCurveResolution;
import com.flather.weatherstation.dto.astronomy.AstronomyCurveDto;
import com.flather.weatherstation.dto.astronomy.AstronomyDailyEventsDto;
import com.flather.weatherstation.service.AstronomySearch;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RequiredArgsConstructor
@RestController
@RequestMapping("/api/astronomy")
public class AstronomyController {

  private final AstronomySearch astronomySearch;

  @GetMapping("/daily")
  public AstronomyDailyEventsDto getDailyEvents() {
    return new AstronomyDailyEventsDto(
        astronomySearch.getSunDailyEvents(),
        astronomySearch.getMoonDailyEvents(),
        astronomySearch.dailyKey());
  }

  @GetMapping("/curve")
  public AstronomyCurveDto getBodyCurve(
      @RequestParam(name = "body", defaultValue = "SUN") CelestialBody body,
      @RequestParam(name = "resolution", defaultValue = "CARD") DailyCurveResolution resolution,
      @RequestParam(name = "daysOffset", defaultValue = "0") int daysOffset) {
    return astronomySearch.getPointsForOffset(body, resolution, daysOffset);
  }
}
