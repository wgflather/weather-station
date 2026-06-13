package com.flather.weatherstation.controller;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
@RequiredArgsConstructor
@Slf4j
public class WeatherDashboardController {
  static final String BASE_PATH = "/weather";

  @GetMapping(BASE_PATH)
  public String getLatestWeather() {
    return "index";
  }
}
