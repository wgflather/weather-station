package com.flather.weatherstation.service;

import com.flather.weatherstation.entity.WeatherRecordDto;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WeatherService {
    private final WeatherRecordMapper mapper;
    private final WeatherReportRepository repository;

    public WeatherRecordDto saveWeatherRecord(WeatherRecordDto weatherRecordDto){
        return mapper.weatherEntityToDto(
                repository.save(
                        mapper.weatherDtoToEntity(weatherRecordDto)
                )
        );
    }

    public WeatherRecordDto getLatestWeatherRecord(){
        return mapper.weatherEntityToDto(repository.findFirstByOrderByCreatedAtDesc());
    }

}
