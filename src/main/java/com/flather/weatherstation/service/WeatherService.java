package com.flather.weatherstation.service;

import com.flather.weatherstation.entity.WeatherRecordCreatedDto;
import com.flather.weatherstation.entity.WeatherRecordResponseDto;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class WeatherService {
    private final WeatherReportRepository repository;
    private final WeatherRecordMapper mapper;

    @Autowired
    public WeatherService(WeatherRecordMapper mapper, WeatherReportRepository repository){
        this.repository = repository;
        this.mapper = mapper;
    }


    public WeatherRecordResponseDto saveWeatherRecord(WeatherRecordCreatedDto weatherRecordDto){
        return mapper.weatherEntityToDto(
                repository.save(
                        mapper.weatherDtoToEntity(weatherRecordDto)
                )
        );
    }

    public Optional<WeatherRecordResponseDto> getLatestWeatherRecord(){
       return repository.findFirstByOrderByMeasuredAtDesc().map(mapper::weatherEntityToDto);
    }

}
