package com.flather.weatherstation.controller;

import com.flather.weatherstation.entity.WeatherRecordResponseDto;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.service.WeatherService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;

import java.time.format.DateTimeFormatter;

@Controller
@RequiredArgsConstructor
public class WeatherDashboardController {
    static final String BASE_PATH = "/weather";

    private final WeatherService service;
    private final WeatherRecordMapper mapper;

    @GetMapping(BASE_PATH)
    public String getLatestWeather(Model model){
        WeatherRecordResponseDto dto = service.getLatestWeatherRecord();
        model.addAttribute("temp", dto.getTemperature());
        model.addAttribute("pressure", dto.getPressure());
        model.addAttribute("measuredAt", dto.getMeasuredAtTimeZoned());

        return "weather_dashboard";
    }



}
