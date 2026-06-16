package com.flather.weatherstation.controller;

import com.flather.weatherstation.dto.forecast.ForecastDto;
import com.flather.weatherstation.service.WeatherClientService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/forecast")
@RequiredArgsConstructor
public class WeatherForecastController {

    private final WeatherClientService service;

    @GetMapping("/clouds")
    public ResponseEntity<ForecastDto> getForecast() {
        return ResponseEntity.ok(service.getForecast());
    }
}
