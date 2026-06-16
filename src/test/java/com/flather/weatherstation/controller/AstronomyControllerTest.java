package com.flather.weatherstation.controller;

import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.flather.weatherstation.domain.constant.CelestialBody;
import com.flather.weatherstation.domain.constant.DailyCurveResolution;
import com.flather.weatherstation.dto.astronomy.*;
import com.flather.weatherstation.service.AstronomySearch;
import java.time.ZonedDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AstronomyController.class)
class AstronomyControllerTest {

  @Autowired MockMvc mockMvc;

  @MockitoBean AstronomySearch astronomySearch;

  @Test
  void shouldReturnDailyEvents() throws Exception {
    ZonedDateTime rise = ZonedDateTime.parse("2026-06-16T04:30:00Z");
    ZonedDateTime set = ZonedDateTime.parse("2026-06-16T20:30:00Z");
    TransitDto solarNoon = new TransitDto(60.0, ZonedDateTime.parse("2026-06-16T12:00:00Z"));

    SunDailyEvents sunEvents =
        new SunDailyEvents(rise, set, solarNoon, null, 57600L, 21600L, List.of());
    MoonDailyEvents moonEvents =
        new MoonDailyEvents(
            ZonedDateTime.parse("2026-06-16T06:00:00Z"),
            ZonedDateTime.parse("2026-06-16T22:00:00Z"),
            new TransitDto(45.0, ZonedDateTime.parse("2026-06-16T14:00:00Z")),
            List.of());

    given(astronomySearch.getSunDailyEvents()).willReturn(sunEvents);
    given(astronomySearch.getMoonDailyEvents()).willReturn(moonEvents);
    given(astronomySearch.dailyKey()).willReturn("2026-06-16@UTC");

    mockMvc
        .perform(get("/api/astronomy/daily").accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.dailyKey").value("2026-06-16@UTC"))
        .andExpect(jsonPath("$.sunDailyEvents.dayLengthSeconds").value(57600L))
        .andExpect(jsonPath("$.moonDailyEvents").isNotEmpty());

    verify(astronomySearch).getSunDailyEvents();
    verify(astronomySearch).getMoonDailyEvents();
    verify(astronomySearch).dailyKey();
  }

  @Test
  void shouldReturnSunCurve_withDefaultParams() throws Exception {
    AstronomyCurveDto curve =
        new AstronomyCurveDto(
            CelestialBody.SUN,
            DailyCurveResolution.CARD,
            List.of(new AstronomyPoint(ZonedDateTime.parse("2026-06-16T06:00Z"), 10.0)));

    given(astronomySearch.getPoints(CelestialBody.SUN, DailyCurveResolution.CARD))
        .willReturn(curve);

    mockMvc
        .perform(get("/api/astronomy/curve").accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.body").value("SUN"))
        .andExpect(jsonPath("$.resolution").value("CARD"))
        .andExpect(jsonPath("$.points[0].altitude").value(10.0));

    verify(astronomySearch).getPoints(CelestialBody.SUN, DailyCurveResolution.CARD);
  }

  @Test
  void shouldReturnMoonCurve_withFullChartResolution() throws Exception {
    AstronomyCurveDto curve =
        new AstronomyCurveDto(CelestialBody.MOON, DailyCurveResolution.FULL_CHART, List.of());

    given(astronomySearch.getPoints(CelestialBody.MOON, DailyCurveResolution.FULL_CHART))
        .willReturn(curve);

    mockMvc
        .perform(
            get("/api/astronomy/curve")
                .param("body", "MOON")
                .param("resolution", "FULL_CHART")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.body").value("MOON"))
        .andExpect(jsonPath("$.resolution").value("FULL_CHART"));

    verify(astronomySearch).getPoints(CelestialBody.MOON, DailyCurveResolution.FULL_CHART);
  }

  @Test
  void shouldReturn400_whenCelestialBodyIsInvalid() throws Exception {
    mockMvc
        .perform(
            get("/api/astronomy/curve").param("body", "MARS").accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isBadRequest());
  }
}
