package com.flather.weatherstation.service;

import com.flather.weatherstation.entity.WeatherRecordCreatedDto;
import com.flather.weatherstation.entity.WeatherRecordResponseDto;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WeatherService {
    private final WeatherRecordMapper mapper;
    private final WeatherReportRepository repository;

    public WeatherRecordResponseDto saveWeatherRecord(WeatherRecordCreatedDto weatherRecordDto){
        return mapper.weatherEntityToDto(
                repository.save(
                        mapper.weatherDtoToEntity(weatherRecordDto)
                )
        );
    }

    public WeatherRecordResponseDto getLatestWeatherRecord(){
        return mapper.weatherEntityToDto(repository.findFirstByOrderByMeasuredAtDesc());
    }

}
