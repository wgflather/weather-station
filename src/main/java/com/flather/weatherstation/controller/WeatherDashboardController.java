package com.flather.weatherstation.controller;

import com.flather.weatherstation.entity.WeatherRecordResponseDto;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.service.WeatherService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import java.time.format.DateTimeFormatter;
import java.util.Optional;

@Controller
@RequiredArgsConstructor
@Slf4j
public class WeatherDashboardController {
    static final String BASE_PATH = "/weather";

    private final WeatherService service;
    private final WeatherRecordMapper mapper;

    @GetMapping(BASE_PATH)
    public String getLatestWeather(Model model){
        Optional<WeatherRecordResponseDto> dto = service.getLatestWeatherRecord();
        model.addAttribute("weather", dto.orElse(null));
        log.info("Retrieved Weather Record: {}",dto);

        return "weather_dashboard";
    }



}
