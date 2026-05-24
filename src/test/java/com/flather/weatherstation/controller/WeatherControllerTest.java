package com.flather.weatherstation.controller;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.flather.weatherstation.dto.analytics.HourlyChartAvgDto;
import com.flather.weatherstation.dto.analytics.PressureDto;
import com.flather.weatherstation.dto.analytics.TemperatureDto;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.dashboard.SystemHealthDashboardDto;
import com.flather.weatherstation.dto.dashboard.WeatherDashboardDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.mapper.WeatherRecordMapperImpl;
import com.flather.weatherstation.model.constant.DataStatus;
import com.flather.weatherstation.model.entity.WeatherRecord;
import com.flather.weatherstation.service.AnalyticsService;
import com.flather.weatherstation.service.DashboardService;
import com.flather.weatherstation.service.WeatherService;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(WeatherController.class)
@Import(WeatherRecordMapperImpl.class)
class WeatherControllerTest {

  @Autowired MockMvc mockMvc;

  @MockitoBean private WeatherService service;

  @MockitoBean private AnalyticsService analyticsService;

  @MockitoBean private DashboardService dashboardService;

  @Autowired WeatherRecordMapper mapper;

  private static final DateTimeFormatter JSON_FORMAT =
      DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssxxx");

  @Test
  void shouldReturnLatestWeatherRecord_whenDataExists() throws Exception {
    Instant instant = Instant.parse("2026-05-20T12:00:00Z");

    WeatherRecord entity =
        WeatherRecord.builder().measuredAt(instant).temperature(20.0).pressure(1000.0).build();
    WeatherRecordResponseDto savedRecord = mapper.weatherEntityToDto(entity);

    given(service.getLatestTodayWeatherRecord()).willReturn(Optional.of(savedRecord));

    mockMvc
        .perform(get(WeatherController.LATEST_WEATHER_PATH).accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(content().contentType(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.temperature", is(savedRecord.getTemperature())))
        .andExpect(jsonPath("$.pressure", is(savedRecord.getPressure())))
        .andExpect(
            jsonPath(
                "$.measuredAtTimeZoned",
                is(savedRecord.getMeasuredAtTimeZoned().format(JSON_FORMAT))));

    verify(service).getLatestTodayWeatherRecord();
  }

  @Test
  void shouldReturnEmptyBody_WhenNoLatestRecordExists() throws Exception {
    given(service.getLatestTodayWeatherRecord()).willReturn(Optional.empty());

    mockMvc
        .perform(
            get(WeatherController.LATEST_WEATHER_PATH)
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$").doesNotExist());

    verify(service).getLatestTodayWeatherRecord();
  }

  @Test
  void shouldReturnDashboard_WhenDataAvailable() throws Exception {
    Instant instant = Instant.parse("2026-05-20T12:00:00Z");

    WeatherDashboardDto dashboardDto =
        WeatherDashboardDto.builder()
            .metricsDashboardDto(
                com.flather.weatherstation.dto.dashboard.MetricsDashboardDto.builder()
                    .temperature(new TemperatureDto(23.0, 18.0, 32.0))
                    .pressure(new PressureDto(1000.0))
                    .build())
            .systemHealthDashboardDto(
                SystemHealthDashboardDto.builder()
                    .lastMeasuredAt(instant.atZone(ZoneId.systemDefault()))
                    .lagMinutes(120)
                    .recordsToday(47L)
                    .status(DataStatus.LIVE)
                    .build())
            .build();

    given(dashboardService.getWeatherDashboard()).willReturn(dashboardDto);

    mockMvc
        .perform(
            get(WeatherController.BASE_PATH + "/dashboard").contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.metricsDashboardDto.temperature.avgTemp", is(23.0)))
        .andExpect(jsonPath("$.metricsDashboardDto.temperature.min", is(18.0)))
        .andExpect(jsonPath("$.metricsDashboardDto.temperature.max", is(32.0)))
        .andExpect(jsonPath("$.metricsDashboardDto.pressure.avgPressure", is(1000.0)))
        .andExpect(jsonPath("$.systemHealthDashboardDto.recordsToday", is(47)))
        .andExpect(jsonPath("$.systemHealthDashboardDto.status", is(DataStatus.LIVE.toString())));

    verify(dashboardService).getWeatherDashboard();
  }

  @Test
  void shouldReturnChart_WithTemperatureMetric() throws Exception {
    Instant now = Instant.parse("2026-05-20T12:00:00Z");

    HourlyChartAvgDto point1 =
        new HourlyChartAvgDto(ZonedDateTime.parse("2026-05-20T10:00Z"), 21.5);
    HourlyChartAvgDto point2 =
        new HourlyChartAvgDto(ZonedDateTime.parse("2026-05-20T11:00Z"), 23.0);

    ChartDto chart = new ChartDto("temperature", List.of(point1, point2), now.plusSeconds(600));

    given(analyticsService.returnChart(eq("temperature"), nullable(String.class)))
        .willReturn(chart);

    mockMvc
        .perform(
            get(WeatherController.BASE_PATH + "/chart")
                .param("metric", "temperature")
                .accept(MediaType.APPLICATION_JSON)
                .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
        .andExpect(jsonPath("$.metric", is("temperature")))
        .andExpect(jsonPath("$.chartPoints[0].hourlyValue").value(21.5))
        .andExpect(jsonPath("$.nextBucketExpectedAt").isNotEmpty());

    verify(analyticsService).returnChart(eq("temperature"), nullable(String.class));
  }

  @Test
  void shouldReturnChart_WithPressureMetric() throws Exception {
    Instant now = Instant.now();

    PressureDto pressureData = new PressureDto(1012.0);
    HourlyChartAvgDto point1 =
        new HourlyChartAvgDto(ZonedDateTime.parse("2026-05-20T10:00Z"), 1010.0);

    ChartDto chart = new ChartDto("pressure", List.of(point1), now.plusSeconds(600));

    given(analyticsService.returnChart(eq("pressure"), nullable(String.class))).willReturn(chart);

    mockMvc
        .perform(
            get(WeatherController.BASE_PATH + "/chart")
                .param("metric", "pressure")
                .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.metric", is("pressure")))
        .andExpect(jsonPath("$.chartPoints[0].hourlyValue").value(1010.0));

    verify(analyticsService).returnChart(eq("pressure"), nullable(String.class));
  }

  @Test
  void shouldReturnChart_WithSinceParameter() throws Exception {
    Instant now = Instant.now();

    ChartDto chart = new ChartDto("temperature", List.of(), now.plusSeconds(3600));

    given(analyticsService.returnChart(eq("temperature"), eq("2026-05-19T14:00Z")))
        .willReturn(chart);

    mockMvc
        .perform(
            get(WeatherController.BASE_PATH + "/chart")
                .param("metric", "temperature")
                .param("since", "2026-05-19T14:00Z")
                .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.metric", is("temperature")))
        .andExpect(jsonPath("$.chartPoints").isArray());

    verify(analyticsService).returnChart(eq("temperature"), eq("2026-05-19T14:00Z"));
  }

  @Test
  void shouldReturnBadRequest_WhenMetricInvalid() throws Exception {

    given(analyticsService.returnChart(eq("invalid_metric"), any()))
        .willThrow(new IllegalArgumentException("Unknown metric"));

    mockMvc
        .perform(
            get(WeatherController.BASE_PATH + "/chart")
                .param("metric", "invalid_metric")
                .contentType(MediaType.APPLICATION_JSON))
        .andExpect(status().isBadRequest());

    verify(analyticsService).returnChart(eq("invalid_metric"), nullable(String.class));
  }
}
