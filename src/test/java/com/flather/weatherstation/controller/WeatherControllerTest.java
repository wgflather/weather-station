package com.flather.weatherstation.controller;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.flather.weatherstation.domain.constant.DataStatus;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.dto.analytics.ChartPointDto;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.dashboard.DashboardLiveDto;
import com.flather.weatherstation.dto.dashboard.MetricsDashboardDto;
import com.flather.weatherstation.dto.dashboard.SystemHealthDashboardDto;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import com.flather.weatherstation.service.AnalyticsService;
import com.flather.weatherstation.service.DashboardService;
import com.flather.weatherstation.service.WeatherService;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

@WebMvcTest(WeatherController.class)
class WeatherControllerTest {

  @Autowired MockMvc mockMvc;
  @Autowired ObjectMapper objectMapper;

  @MockitoBean WeatherService service;
  @MockitoBean AnalyticsService analyticsService;
  @MockitoBean DashboardService dashboardService;

  @Test
  void shouldCreateWeatherRecord_andReturn201() throws Exception {
    WeatherRecordCreatedDto dto =
        WeatherRecordCreatedDto.builder()
            .deviceId("device-1")
            .temperature(22.5)
            .pressure(1013.0)
            .wifiRssi(-70.0)
            .build();

    WeatherRecordResponseDto response =
        WeatherRecordResponseDto.builder()
            .temperature(22.5)
            .pressure(1013.0)
            .measuredAtTimeZoned(ZonedDateTime.parse("2026-06-16T10:00:00Z"))
            .build();

    given(service.saveWeatherRecord(any())).willReturn(response);

    mockMvc
        .perform(
            post(WeatherController.BASE_PATH)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(dto)))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.temperature").value(22.5))
        .andExpect(jsonPath("$.pressure").value(1013.0));

    verify(service).saveWeatherRecord(any());
  }

  @Test
  void shouldReturn400_whenCreateBodyIsMalformedJson() throws Exception {
    mockMvc
        .perform(
            post(WeatherController.BASE_PATH)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{not valid json"))
        .andExpect(status().isBadRequest());
  }

  @Test
  void shouldReturnDashboardLive() throws Exception {
    DashboardLiveDto liveDto =
        new DashboardLiveDto(
            MetricsDashboardDto.builder().build(),
            SystemHealthDashboardDto.builder()
                .recordsToday(50L)
                .lagMinutes(5L)
                .status(DataStatus.LIVE)
                .lastMeasuredAt(ZonedDateTime.now(ZoneId.of("UTC")))
                .build(),
            null,
            null,
            "2026-06-16@UTC");

    given(dashboardService.getDashboardLive()).willReturn(liveDto);

    mockMvc
        .perform(get(WeatherController.DASHBOARD_LIVE_PATH).accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.systemHealth.recordsToday").value(50))
        .andExpect(jsonPath("$.systemHealth.status").value("LIVE"))
        .andExpect(jsonPath("$.dailyKey").value("2026-06-16@UTC"));

    verify(dashboardService).getDashboardLive();
  }

  @Test
  void shouldReturnChart_withDefaultMetric() throws Exception {
    ChartDto chart =
        new ChartDto(
            "temperature",
            List.of(new ChartPointDto(ZonedDateTime.parse("2026-06-16T10:00Z"), 21.0)),
            Instant.parse("2026-06-16T11:00:00Z"));

    given(analyticsService.returnChart(eq(Metric.TEMPERATURE), isNull(), eq(10))).willReturn(chart);

    mockMvc
        .perform(get(WeatherController.BASE_PATH + "/chart").accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.metric").value("temperature"))
        .andExpect(jsonPath("$.chartPoints", hasSize(1)))
        .andExpect(jsonPath("$.chartPoints[0].hourlyValue").value(21.0));

    verify(analyticsService).returnChart(eq(Metric.TEMPERATURE), isNull(), eq(10));
  }

  @Test
  void shouldReturnChart_withExplicitMetricAndResolution() throws Exception {
    ChartDto chart = new ChartDto("pressure", List.of(), Instant.parse("2026-06-16T11:00:00Z"));

    given(analyticsService.returnChart(eq(Metric.PRESSURE), isNull(), eq(5))).willReturn(chart);

    mockMvc
        .perform(
            get(WeatherController.BASE_PATH + "/chart")
                .param("metric", "pressure")
                .param("resolution", "5")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.metric").value("pressure"))
        .andExpect(jsonPath("$.chartPoints").isArray());

    verify(analyticsService).returnChart(eq(Metric.PRESSURE), isNull(), eq(5));
  }

  @Test
  void shouldReturnChart_withSinceParameter() throws Exception {
    String since = "2026-06-15T00:00:00Z";
    ChartDto chart = new ChartDto("temperature", List.of(), Instant.parse("2026-06-16T11:00:00Z"));

    given(analyticsService.returnChart(eq(Metric.TEMPERATURE), eq(since), eq(10)))
        .willReturn(chart);

    mockMvc
        .perform(
            get(WeatherController.BASE_PATH + "/chart")
                .param("metric", "temperature")
                .param("since", since)
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.metric").value("temperature"));

    verify(analyticsService).returnChart(eq(Metric.TEMPERATURE), eq(since), eq(10));
  }

  @Test
  void shouldReturn400_whenMetricIsInvalid() throws Exception {
    mockMvc
        .perform(
            get(WeatherController.BASE_PATH + "/chart")
                .param("metric", "invalid_metric")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isBadRequest());
  }
}
