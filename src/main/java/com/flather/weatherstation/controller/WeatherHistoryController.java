package com.flather.weatherstation.controller;

import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.dto.analytics.DailyHistoryDto;
import com.flather.weatherstation.dto.analytics.FullDaySummary;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.weather.HourlyWeatherRecordDto;
import com.flather.weatherstation.service.WeatherHistoryService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class WeatherHistoryController {

  public static final String BASE_PATH = "/api/weather/history";
  public static final String HOURLY_PATH = BASE_PATH + "/hourly";
  public static final String DAILY_PATH = BASE_PATH + "/daily";
  public static final String DAILY_SUMMARY_PATH = DAILY_PATH + "/summary";
  public static final String CHART_PATH = BASE_PATH + "/chart";
  public static final String CHART_DAY_PATH = BASE_PATH + "/chart/day";
  public static final String AVAILABLE_DATES_PATH = BASE_PATH + "/available-dates";

  private final WeatherHistoryService historyService;

  @GetMapping(AVAILABLE_DATES_PATH)
  public ResponseEntity<List<LocalDate>> getAvailableDates(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    return ResponseEntity.ok(historyService.getAvailableDates(from, to));
  }

  @GetMapping(CHART_PATH)
  public ResponseEntity<ChartDto> getHistoryChart(
      @RequestParam Metric metric, @RequestParam Instant from, @RequestParam Instant to) {
    return ResponseEntity.ok(historyService.getChart(metric, from, to));
  }

  @GetMapping(CHART_DAY_PATH)
  public ResponseEntity<ChartDto> getHourlyChart(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
      @RequestParam Metric metric) {
    return ResponseEntity.ok(historyService.getDayChart(date, metric));
  }

  @GetMapping(HOURLY_PATH)
  public ResponseEntity<List<HourlyWeatherRecordDto>> getHourlyHistory(
      @RequestParam Instant from, @RequestParam Instant to) {
    return ResponseEntity.ok(historyService.getHourlyHistory(from, to));
  }

  @GetMapping(DAILY_SUMMARY_PATH)
  public ResponseEntity<FullDaySummary> getDailySummary(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
    return ResponseEntity.ok(historyService.getHistoryDailySummary(date));
  }

  /**
   * Chart data and stat cards for a range, in one response. Which cards come back depends on the
   * metric — one that cannot answer a question omits that card, and one with no cards defined
   * returns an empty list — so the client renders whatever arrives rather than expecting three.
   */
  @GetMapping(DAILY_PATH)
  public ResponseEntity<DailyHistoryDto> getDailyHistory(
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
      @RequestParam Metric metric) {
    return ResponseEntity.ok(historyService.getDailyHistory(from, to, metric));
  }
}
