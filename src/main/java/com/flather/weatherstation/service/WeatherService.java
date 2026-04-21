package com.flather.weatherstation.service;

import com.flather.weatherstation.entity.WeatherRecordCreatedDto;
import com.flather.weatherstation.entity.WeatherRecordResponseDto;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@Slf4j
public class WeatherService {
    private final WeatherReportRepository repository;
    private final WeatherRecordMapper mapper;

    @Autowired
    public WeatherService(WeatherRecordMapper mapper, WeatherReportRepository repository){
        this.repository = repository;
        this.mapper = mapper;
    }


    public WeatherRecordResponseDto saveWeatherRecord(WeatherRecordCreatedDto weatherRecordDto){

        checkForDataAnomaly(weatherRecordDto);
        getLatestWeatherRecord().ifPresent(lr ->
                checkForDataSpikes(weatherRecordDto, lr));

        return mapper.weatherEntityToDto(
                repository.save(
                        mapper.weatherDtoToEntity(weatherRecordDto)
                ));
    }

    public Optional<WeatherRecordResponseDto> getLatestWeatherRecord(){
       return repository.findFirstByOrderByMeasuredAtDesc().map(mapper::weatherEntityToDto);
    }

    private void checkForDataAnomaly(WeatherRecordCreatedDto anomalyDto){
        if(anomalyDto.getTemperature() < -40 || anomalyDto.getTemperature() > 50){
            log.warn("[DATA_ANOMALY] Temperature is unrealistic: {} ℃", anomalyDto.getTemperature());
        }
        if(anomalyDto.getPressure() < 950 || anomalyDto.getPressure() > 1100){
            log.warn("[DATA_ANOMALY] Pressure is unrealistic: {} hPa", anomalyDto.getPressure());
        }
    }

    private void checkForDataSpikes(WeatherRecordCreatedDto weatherRecordDto, WeatherRecordResponseDto lastRecord){
            double newTemp = weatherRecordDto.getTemperature();
            double lastTemp = lastRecord.getTemperature();

            double newPressure = weatherRecordDto.getPressure();
            double lastPressure = lastRecord.getPressure();

            if (Math.abs(newTemp - lastTemp) > 10) {
                log.warn("[DATA_SPIKE] Last temp read: {} ℃ Current temp read: {} ℃",
                        lastRecord.getTemperature(), weatherRecordDto.getTemperature());
            }
            if (Math.abs(newPressure - lastPressure) > 3) {
                log.warn("[DATA_SPIKE] Last pressure read: {} pHa Current pressure read: {} hPa",
                        lastRecord.getPressure(), weatherRecordDto.getPressure());
            }

    }

}
