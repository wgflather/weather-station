package com.flather.weatherstation.controller;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.flather.weatherstation.domain.constant.CardKind;
import com.flather.weatherstation.domain.constant.DataProvider;
import com.flather.weatherstation.domain.constant.DayPeriod;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.dto.analytics.ChartPointDto;
import com.flather.weatherstation.dto.analytics.DailyHistoryDto;
import com.flather.weatherstation.dto.analytics.FullDaySummary;
import com.flather.weatherstation.dto.analytics.MetricSummary;
import com.flather.weatherstation.dto.analytics.SummaryCard;
import com.flather.weatherstation.dto.astronomy.DayPeriodInterval;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.weather.HourlyWeatherRecordDto;
import com.flather.weatherstation.dto.weather.PeriodMetricDto;
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

    // A night starting the evening before is the whole point of the window, so the fixture
    // spans midnight and the assertions pin both ends.
    DayPeriodInterval nightPeriod =
        new DayPeriodInterval(
            ZonedDateTime.parse("2026-06-14T21:47:00Z"),
            ZonedDateTime.parse("2026-06-15T04:38:00Z"));
    DayPeriodInterval dayPeriod =
        new DayPeriodInterval(
            ZonedDateTime.parse("2026-06-15T04:38:00Z"),
            ZonedDateTime.parse("2026-06-15T21:49:00Z"));

    FullDaySummary summary =
        new FullDaySummary(
            date,
            nightPeriod,
            dayPeriod,
            PeriodMetricDto.builder()
                .deviceId("device-1")
                .temperatureMin(15.0)
                .temperatureMax(28.0)
                .temperatureAvg(21.5)
                .period(DayPeriod.FULL)
                .build(),
            PeriodMetricDto.builder().temperatureAvg(25.0).period(DayPeriod.DAY).build(),
            PeriodMetricDto.builder().temperatureAvg(16.0).period(DayPeriod.NIGHT).build());

    given(historyService.getHistoryDailySummary(date)).willReturn(summary);

    mockMvc
        .perform(
            get(WeatherHistoryController.DAILY_SUMMARY_PATH)
                .param("date", "2026-06-15")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.date").value("2026-06-15"))
        .andExpect(jsonPath("$.fullDay.deviceId").value("device-1"))
        .andExpect(jsonPath("$.fullDay.temperatureMin").value(15.0))
        .andExpect(jsonPath("$.fullDay.temperatureMax").value(28.0))
        .andExpect(jsonPath("$.day.temperatureAvg").value(25.0))
        .andExpect(jsonPath("$.night.temperatureAvg").value(16.0))
        .andExpect(jsonPath("$.nightPeriod.start").exists())
        .andExpect(jsonPath("$.nightPeriod.end").exists())
        .andExpect(jsonPath("$.dayPeriod.start").exists())
        // isValid() is internal — it must not leak into the payload as a "valid" field.
        .andExpect(jsonPath("$.nightPeriod.valid").doesNotExist());

    verify(historyService).getHistoryDailySummary(date);
  }

  @Test
  void shouldReturnDailySummary_withNullPeriods_whenDateHasFullRowOnly() throws Exception {
    LocalDate date = LocalDate.of(2026, 6, 15);

    given(historyService.getHistoryDailySummary(date))
        .willReturn(
            new FullDaySummary(
                date,
                null,
                null,
                PeriodMetricDto.builder().temperatureAvg(21.5).build(),
                null,
                null));

    mockMvc
        .perform(
            get(WeatherHistoryController.DAILY_SUMMARY_PATH)
                .param("date", "2026-06-15")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.fullDay.temperatureAvg").value(21.5))
        .andExpect(jsonPath("$.day").doesNotExist())
        .andExpect(jsonPath("$.night").doesNotExist())
        // No night metrics means no night window either — a window over a row of dashes
        // would caption hours nothing was measured across.
        .andExpect(jsonPath("$.nightPeriod").doesNotExist())
        .andExpect(jsonPath("$.dayPeriod").doesNotExist());
  }

  @Test
  void shouldReturnDailyHistory_withChartDataAndCardsInOnePayload() throws Exception {
    LocalDate from = LocalDate.of(2026, 6, 1);
    LocalDate to = LocalDate.of(2026, 6, 16);

    FullDaySummary day1 =
        new FullDaySummary(
            LocalDate.of(2026, 6, 14),
            null,
            null,
            PeriodMetricDto.builder().deviceId("device-1").temperatureAvg(20.0).build(),
            null,
            null);
    FullDaySummary day2 =
        new FullDaySummary(
            LocalDate.of(2026, 6, 15),
            null,
            null,
            PeriodMetricDto.builder().deviceId("device-1").temperatureAvg(22.0).build(),
            null,
            null);

    DailyHistoryDto payload =
        new DailyHistoryDto(
            List.of(day1, day2),
            new MetricSummary(
                Metric.TEMPERATURE,
                List.of(
                    SummaryCard.onDate(
                        CardKind.EXTREME_HIGH, "Warmest day", 31.0, LocalDate.of(2026, 6, 15)),
                    SummaryCard.overRange(CardKind.TREND, "Daylight trend", 3.0, from, to))));

    given(historyService.getDailyHistory(from, to, Metric.TEMPERATURE)).willReturn(payload);

    mockMvc
        .perform(
            get(WeatherHistoryController.DAILY_PATH)
                .param("from", "2026-06-01")
                .param("to", "2026-06-16")
                .param("metric", "temperature")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.days", hasSize(2)))
        .andExpect(jsonPath("$.days[0].date").value("2026-06-14"))
        .andExpect(jsonPath("$.days[1].fullDay.temperatureAvg").value(22.0))
        // Cards ride along with the chart data rather than needing a second request.
        .andExpect(jsonPath("$.summary.metric").value("TEMPERATURE"))
        .andExpect(jsonPath("$.summary.cards", hasSize(2)))
        .andExpect(jsonPath("$.summary.cards[0].kind").value("EXTREME_HIGH"))
        // Raw number and ISO date: the client owns units and locale formatting.
        .andExpect(jsonPath("$.summary.cards[0].value").value(31.0))
        .andExpect(jsonPath("$.summary.cards[0].date").value("2026-06-15"))
        .andExpect(jsonPath("$.summary.cards[0].rangeStart").doesNotExist())
        .andExpect(jsonPath("$.summary.cards[1].rangeStart").value("2026-06-01"))
        .andExpect(jsonPath("$.summary.cards[1].date").doesNotExist());

    verify(historyService).getDailyHistory(from, to, Metric.TEMPERATURE);
  }

  @Test
  void shouldStillReturnChartData_whenMetricHasNoCards() throws Exception {
    LocalDate from = LocalDate.of(2026, 6, 1);
    LocalDate to = LocalDate.of(2026, 6, 16);

    // A metric without a card builder must not take the chart down with it.
    given(historyService.getDailyHistory(from, to, Metric.UV_INDEX))
        .willReturn(
            new DailyHistoryDto(
                List.of(
                    new FullDaySummary(
                        LocalDate.of(2026, 6, 14),
                        null,
                        null,
                        PeriodMetricDto.builder().uvIndexAvg(3.0).build(),
                        null,
                        null)),
                new MetricSummary(Metric.UV_INDEX, List.of())));

    mockMvc
        .perform(
            get(WeatherHistoryController.DAILY_PATH)
                .param("from", "2026-06-01")
                .param("to", "2026-06-16")
                .param("metric", "uvIndex")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.days", hasSize(1)))
        .andExpect(jsonPath("$.summary.cards", hasSize(0)));
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
