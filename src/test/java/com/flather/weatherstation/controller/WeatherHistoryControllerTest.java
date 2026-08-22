package com.flather.weatherstation.controller;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.flather.weatherstation.domain.constant.DataProvider;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.dto.analytics.ChartPointDto;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.weather.DailyWeatherRecordDto;
import com.flather.weatherstation.dto.weather.HourlyWeatherRecordDto;
import com.flather.weatherstation.service.WeatherHistoryService;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZonedDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(WeatherHistoryController.class)
class WeatherHistoryControllerTest {

  @Autowired MockMvc mockMvc;

  @MockitoBean WeatherHistoryService historyService;

  @Test
  void shouldReturnAvailableDates() throws Exception {
    LocalDate from = LocalDate.of(2026, 6, 1);
    LocalDate to = LocalDate.of(2026, 6, 16);

    given(historyService.getAvailableDates(from, to))
        .willReturn(List.of(LocalDate.of(2026, 6, 14), LocalDate.of(2026, 6, 15)));

    mockMvc
        .perform(
            get(WeatherHistoryController.AVAILABLE_DATES_PATH)
                .param("from", "2026-06-01")
                .param("to", "2026-06-16")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(2)))
        .andExpect(jsonPath("$[0]").value("2026-06-14"));

    verify(historyService).getAvailableDates(from, to);
  }

  @Test
  void shouldReturnHistoryChart_byInstantRange() throws Exception {
    Instant from = Instant.parse("2026-06-15T00:00:00Z");
    Instant to = Instant.parse("2026-06-16T00:00:00Z");

    ChartDto chart =
        new ChartDto(
            "temperature",
            List.of(new ChartPointDto(ZonedDateTime.parse("2026-06-15T10:00Z"), 20.0)),
            Instant.parse("2026-06-16T01:00:00Z"),
            DataProvider.LOCAL_SENSOR);

    given(historyService.getChart(eq(Metric.TEMPERATURE), eq(from), eq(to))).willReturn(chart);

    mockMvc
        .perform(
            get(WeatherHistoryController.CHART_PATH)
                .param("metric", "temperature")
                .param("from", "2026-06-15T00:00:00Z")
                .param("to", "2026-06-16T00:00:00Z")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.metric").value("temperature"))
        .andExpect(jsonPath("$.chartPoints", hasSize(1)));

    verify(historyService).getChart(eq(Metric.TEMPERATURE), eq(from), eq(to));
  }

  @Test
  void shouldReturnDayChart_byDateAndMetric() throws Exception {
    LocalDate date = LocalDate.of(2026, 6, 15);
    ChartDto chart =
        new ChartDto(
            "pressure",
            List.of(),
            Instant.parse("2026-06-16T00:00:00Z"),
            DataProvider.LOCAL_SENSOR);

    given(historyService.getDayChart(date, Metric.PRESSURE)).willReturn(chart);

    mockMvc
        .perform(
            get(WeatherHistoryController.CHART_DAY_PATH)
                .param("date", "2026-06-15")
                .param("metric", "pressure")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.metric").value("pressure"));

    verify(historyService).getDayChart(date, Metric.PRESSURE);
  }

  @Test
  void shouldReturnDailyChartPoints_byDateRangeAndMetric() throws Exception {
    LocalDate from = LocalDate.of(2026, 6, 1);
    LocalDate to = LocalDate.of(2026, 6, 16);

    ChartDto chart =
        new ChartDto(
            "humidity",
            List.of(new ChartPointDto(ZonedDateTime.parse("2026-06-01T12:00Z"), 65.0)),
            Instant.parse("2026-06-16T00:00:00Z"),
            DataProvider.LOCAL_SENSOR);

    given(historyService.getDailyChartPoints(from, to, Metric.HUMIDITY)).willReturn(chart);

    mockMvc
        .perform(
            get(WeatherHistoryController.CHART_DAILY_PATH)
                .param("from", "2026-06-01")
                .param("to", "2026-06-16")
                .param("metric", "humidity")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.metric").value("humidity"))
        .andExpect(jsonPath("$.chartPoints[0].hourlyValue").value(65.0));

    verify(historyService).getDailyChartPoints(from, to, Metric.HUMIDITY);
  }

  @Test
  void shouldReturnHourlyHistory_byInstantRange() throws Exception {
    Instant from = Instant.parse("2026-06-15T00:00:00Z");
    Instant to = Instant.parse("2026-06-16T00:00:00Z");

    HourlyWeatherRecordDto record =
        HourlyWeatherRecordDto.builder()
            .deviceId("device-1")
            .temperatureAvg(21.5)
            .pressureAvg(1012.0)
            .hour(Instant.parse("2026-06-15T10:00:00Z"))
            .build();

    given(historyService.getHourlyHistory(from, to)).willReturn(List.of(record));

    mockMvc
        .perform(
            get(WeatherHistoryController.HOURLY_PATH)
                .param("from", "2026-06-15T00:00:00Z")
                .param("to", "2026-06-16T00:00:00Z")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(1)))
        .andExpect(jsonPath("$[0].deviceId").value("device-1"))
        .andExpect(jsonPath("$[0].temperatureAvg").value(21.5));

    verify(historyService).getHourlyHistory(from, to);
  }

  @Test
  void shouldReturnDailySummary_byDate() throws Exception {
    LocalDate date = LocalDate.of(2026, 6, 15);

    DailyWeatherRecordDto summary =
        DailyWeatherRecordDto.builder()
            .deviceId("device-1")
            .temperatureMin(15.0)
            .temperatureMax(28.0)
            .temperatureAvg(21.5)
            .date(date)
            .build();

    given(historyService.getHistoryDailySummary(date)).willReturn(summary);

    mockMvc
        .perform(
            get(WeatherHistoryController.DAILY_SUMMARY_PATH)
                .param("date", "2026-06-15")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.deviceId").value("device-1"))
        .andExpect(jsonPath("$.temperatureMin").value(15.0))
        .andExpect(jsonPath("$.temperatureMax").value(28.0))
        .andExpect(jsonPath("$.date").value("2026-06-15"));

    verify(historyService).getHistoryDailySummary(date);
  }

  @Test
  void shouldReturnDailyHistory_byDateRange() throws Exception {
    LocalDate from = LocalDate.of(2026, 6, 1);
    LocalDate to = LocalDate.of(2026, 6, 16);

    DailyWeatherRecordDto day1 =
        DailyWeatherRecordDto.builder()
            .deviceId("device-1")
            .temperatureAvg(20.0)
            .date(LocalDate.of(2026, 6, 14))
            .build();
    DailyWeatherRecordDto day2 =
        DailyWeatherRecordDto.builder()
            .deviceId("device-1")
            .temperatureAvg(22.0)
            .date(LocalDate.of(2026, 6, 15))
            .build();

    given(historyService.getDailyHistory(from, to)).willReturn(List.of(day1, day2));

    mockMvc
        .perform(
            get(WeatherHistoryController.DAILY_PATH)
                .param("from", "2026-06-01")
                .param("to", "2026-06-16")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(2)))
        .andExpect(jsonPath("$[0].date").value("2026-06-14"))
        .andExpect(jsonPath("$[1].temperatureAvg").value(22.0));

    verify(historyService).getDailyHistory(from, to);
  }

  @Test
  void shouldReturn400_whenHistoryChartMetricIsInvalid() throws Exception {
    mockMvc
        .perform(
            get(WeatherHistoryController.CHART_PATH)
                .param("metric", "unknown")
                .param("from", "2026-06-15T00:00:00Z")
                .param("to", "2026-06-16T00:00:00Z")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isBadRequest());
  }
}
