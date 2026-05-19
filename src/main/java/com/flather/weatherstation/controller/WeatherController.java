package com.flather.weatherstation.controller;

import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.dashboard.WeatherDashboardDto;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import com.flather.weatherstation.service.AnalyticsService;
import com.flather.weatherstation.service.DashboardService;
import com.flather.weatherstation.service.WeatherService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@Slf4j
@CrossOrigin(origins = "http://127.0.0.1:5500")
public class WeatherController {

  public static final String BASE_PATH = "/api/weather";
  public static final String LATEST_WEATHER_PATH = BASE_PATH + "/latest";

  private final WeatherService service;
  private final AnalyticsService analyticsService;
  private final DashboardService dashboardService;

  @PostMapping(BASE_PATH)
  public ResponseEntity<Void> saveWeatherRecord(@Valid @RequestBody WeatherRecordCreatedDto dto) {
    WeatherRecordResponseDto savedRecord = service.saveWeatherRecord(dto);
    log.info("Saved a new weather record: {}", savedRecord);

    return ResponseEntity.noContent().build();
  }

  @GetMapping(LATEST_WEATHER_PATH)
  public ResponseEntity<WeatherRecordResponseDto> getLatestWeatherRecord() {
    return ResponseEntity.ok(service.getLatestTodayWeatherRecord().orElse(null));
  }

  @GetMapping(BASE_PATH + "/dashboard")
  public ResponseEntity<WeatherDashboardDto> getDashboard() {
    return ResponseEntity.ok(dashboardService.getWeatherDashboard());
  }

  @GetMapping(BASE_PATH + "/chart")
  public ResponseEntity<ChartDto> getChart(
      @RequestParam(value = "metric", defaultValue = "temperature") String metric,
      @RequestParam(required = false, value = "since") String since) {
    return ResponseEntity.ok(analyticsService.returnChart(metric, since));
  }
}
