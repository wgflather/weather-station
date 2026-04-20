package com.flather.weatherstation.controller;

import com.flather.weatherstation.entity.WeatherRecordCreatedDto;
import com.flather.weatherstation.entity.WeatherRecordResponseDto;
import com.flather.weatherstation.service.WeatherService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class WeatherController {

    static final String BASE_PATH = "/weather";
    static final String LATEST_WEATHER_PATH = BASE_PATH + "/latest";

    private final WeatherService service;

    @PostMapping(BASE_PATH)
    public ResponseEntity<Void> saveWeatherRecord(@Valid @RequestBody WeatherRecordCreatedDto dto){
        WeatherRecordResponseDto savedRecord = service.saveWeatherRecord(dto);
        System.out.println(savedRecord.toString());
        return ResponseEntity.noContent().build();

    }

    @GetMapping(LATEST_WEATHER_PATH)
    public ResponseEntity<WeatherRecordResponseDto> getLatestWeatherRecord(){
        return ResponseEntity.ok(service.getLatestWeatherRecord());
    }


}
