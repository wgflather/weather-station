package com.flather.weatherstation.controller;

import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.dashboard.DashboardLiveDto;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import com.flather.weatherstation.service.DashboardService;
import com.flather.weatherstation.service.WeatherService;
import java.net.URI;
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
  public static final String DASHBOARD_LIVE_PATH = BASE_PATH + "/dashboard/live";

  private final WeatherService service;
  private final DashboardService dashboardService;

  @PostMapping(BASE_PATH)
  public ResponseEntity<WeatherRecordResponseDto> createNewWeatherRecord(
      @RequestBody WeatherRecordCreatedDto dto) {
    return ResponseEntity.created(URI.create("api/weather")).body(service.saveWeatherRecord(dto));
  }

  /** Live dashboard tick: metrics, system health, sun/moon snapshots, and current dailyKey. */
  @GetMapping(DASHBOARD_LIVE_PATH)
  public ResponseEntity<DashboardLiveDto> getDashboardLive() {
    return ResponseEntity.ok(dashboardService.getDashboardLive());
  }

  @GetMapping(BASE_PATH + "/chart")
  public ResponseEntity<ChartDto> getChart(
      @RequestParam(value = "metric", defaultValue = "temperature") Metric metric,
      @RequestParam(value = "resolution", defaultValue = "10") int resolution,
      @RequestParam(required = false, value = "since") String since) {
    return ResponseEntity.ok(dashboardService.getChart(metric, since, resolution));
  }
}
