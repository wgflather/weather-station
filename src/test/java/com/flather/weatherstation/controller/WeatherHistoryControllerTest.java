package com.flather.weatherstation.controller;

import static org.hamcrest.Matchers.*;
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
import java.time.LocalTime;
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
  void shouldReturnDayChart_byDateAndMetric() throws Exception {
    LocalDate date = LocalDate.of(2026, 6, 15);
    ChartDto chart =
        new ChartDto(
            "pressure",
            List.of(new ChartPointDto(ZonedDateTime.parse("2026-06-15T10:00Z"), 1013.0)),
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
        .andExpect(jsonPath("$.metric").value("pressure"))
        .andExpect(jsonPath("$.chartPoints", hasSize(1)));

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

  /**
   * Pins the wire format of a diurnal card, which the frontend parses by hand.
   *
   * <p>The times are wall-clock at the station, so they go out bare — no offset, no date — and the
   * client renders them as they arrive rather than converting into the viewer's zone. A window that
   * wraps past midnight ends earlier on the clock than it starts, and the date fields stay absent
   * so the client can tell the two context shapes apart by presence alone.
   */
  @Test
  void shouldReturnDiurnalCards_asBareWallClockTimes() throws Exception {
    LocalDate from = LocalDate.of(2026, 6, 1);
    LocalDate to = LocalDate.of(2026, 6, 16);

    DailyHistoryDto payload =
        new DailyHistoryDto(
            List.of(),
            new MetricSummary(
                Metric.HUMIDITY,
                List.of(
                    SummaryCard.overWindow(
                        CardKind.EXTREME_LOW,
                        "Driest stretch",
                        29.8,
                        LocalTime.of(13, 0),
                        LocalTime.of(16, 0)),
                    SummaryCard.overWindow(
                        CardKind.EXTREME_HIGH,
                        "Most humid stretch",
                        94.1,
                        LocalTime.of(23, 0),
                        LocalTime.of(2, 0)))));

    given(historyService.getDailyHistory(from, to, Metric.HUMIDITY)).willReturn(payload);

    mockMvc
        .perform(
            get(WeatherHistoryController.DAILY_PATH)
                .param("from", "2026-06-01")
                .param("to", "2026-06-16")
                .param("metric", "humidity")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.summary.cards[0].label").value("Driest stretch"))
        .andExpect(jsonPath("$.summary.cards[0].windowStart").value("13:00:00"))
        .andExpect(jsonPath("$.summary.cards[0].windowEnd").value("16:00:00"))
        .andExpect(jsonPath("$.summary.cards[0].date").doesNotExist())
        .andExpect(jsonPath("$.summary.cards[0].rangeStart").doesNotExist())
        // Wrapping past midnight is normal, not a swap to correct on the client.
        .andExpect(jsonPath("$.summary.cards[1].windowStart").value("23:00:00"))
        .andExpect(jsonPath("$.summary.cards[1].windowEnd").value("02:00:00"));
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
            get(WeatherHistoryController.CHART_DAY_PATH)
                .param("metric", "unknown")
                .param("date", "2026-06-15")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isBadRequest());
  }
}
