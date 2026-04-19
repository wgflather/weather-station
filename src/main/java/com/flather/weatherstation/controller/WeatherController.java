package com.flather.weatherstation.controller;

import com.flather.weatherstation.entity.WeatherRecordDto;
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
    public ResponseEntity<Void> saveWeatherRecord(@Valid @RequestBody WeatherRecordDto dto){
//        service.saveWeatherRecord(dto);
        System.out.println(dto.toString());
        return ResponseEntity.noContent().build();

    }

    @GetMapping(LATEST_WEATHER_PATH)
    public ResponseEntity<WeatherRecordDto> getLatestWeatherRecord(){
        return ResponseEntity.ok(service.getLatestWeatherRecord());
    }


}
