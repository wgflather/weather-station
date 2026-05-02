package com.flather.weatherstation.service;

import com.flather.weatherstation.config.TimezoneProperties;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import com.flather.weatherstation.model.constant.DataQuality;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.model.entity.WeatherRecord;
import com.flather.weatherstation.repository.WeatherReportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.Optional;

@Service
@Slf4j
@RequiredArgsConstructor
public class WeatherService {
    private final WeatherReportRepository repository;
    private final DataQualityValidator qualityValidator;
    private final WeatherRecordMapper mapper;
    private final TimezoneProperties timezoneProperties;

    @Transactional
    public WeatherRecordResponseDto saveWeatherRecord(WeatherRecordCreatedDto weatherRecordDto){

        WeatherRecord record = mapper.weatherDtoToEntity(weatherRecordDto);
        Optional<WeatherRecordResponseDto> latestRecord = getLatestTodayWeatherRecord();

        boolean isAnomaly = qualityValidator.checkForDataAnomaly(weatherRecordDto);

        boolean isSpike = latestRecord.map(
                last ->
                        qualityValidator.checkForDataSpikes(weatherRecordDto, last))
                .orElse(false);

        DataQuality quality = qualityValidator.setDataQualityStatus(isAnomaly, isSpike);

        record.setDataQuality(quality);

        return mapper.weatherEntityToDto(repository.save(record));
    }


    @Transactional(readOnly = true)
    public Optional<WeatherRecordResponseDto> getLatestTodayWeatherRecord(){

        ZoneId zoneId = ZoneId.of(timezoneProperties.getZoneId());

        LocalDate currentDate = LocalDate.now(zoneId);

        Instant startOfTheCurrentDate = currentDate.atStartOfDay(zoneId).toInstant();

        Instant endOfTheCurrentDate = currentDate.plusDays(1).atStartOfDay(zoneId).toInstant();

        return repository.findFirstByMeasuredAtBetweenOrderByMeasuredAtDesc(startOfTheCurrentDate, endOfTheCurrentDate).map(mapper::weatherEntityToDto);
    }


}
