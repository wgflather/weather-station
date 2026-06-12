package com.flather.weatherstation.controller;

import com.flather.weatherstation.dto.dashboard.WeatherDashboardDto;
import com.flather.weatherstation.service.DashboardService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
@RequiredArgsConstructor
@Slf4j
public class WeatherDashboardController {
  static final String BASE_PATH = "/weather";

  private final DashboardService dashboardService;

  @GetMapping(BASE_PATH)
  public String getLatestWeather(Model model) {
    WeatherDashboardDto weatherDashboard = dashboardService.getWeatherDashboard();
    model.addAttribute("dashboard", weatherDashboard);
    log.info("Retrieved Weather Record Dashboard Object: {}", weatherDashboard);

    return "index";
  }
}
