package com.flather.weatherstation.controller;

import com.flather.weatherstation.entity.WeatherDashboardDto;
import com.flather.weatherstation.entity.WeatherRecordCreatedDto;
import com.flather.weatherstation.entity.WeatherRecordResponseDto;
import com.flather.weatherstation.service.WeatherService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequiredArgsConstructor
@Slf4j
public class WeatherController {

    public static final String BASE_PATH = "/api/weather";
    public static final String LATEST_WEATHER_PATH = BASE_PATH + "/latest";

    private final WeatherService service;


    @PostMapping(BASE_PATH)
    public ResponseEntity<Void> saveWeatherRecord(@Valid @RequestBody WeatherRecordCreatedDto dto){
        WeatherRecordResponseDto savedRecord = service.saveWeatherRecord(dto);
        log.info("Saved a new weather record: {}", savedRecord);

        return ResponseEntity.noContent().build();

    }

    @GetMapping(LATEST_WEATHER_PATH)
    public ResponseEntity<WeatherRecordResponseDto> getLatestWeatherRecord(){

        return ResponseEntity.ok(service.getLatestTodayWeatherRecord().orElse(null));
    }


    @GetMapping(BASE_PATH + "/dashboard")
    public ResponseEntity<WeatherDashboardDto> getDashboard(){
        return ResponseEntity.ok(service.getDashboardSummary());
    }

}
