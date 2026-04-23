package com.flather.weatherstation.service;

import com.flather.weatherstation.entity.*;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.*;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
@Slf4j
public class WeatherService {
    private final WeatherReportRepository repository;
    private final DataQualityValidator qualityValidator;
    private final WeatherRecordMapper mapper;

    @Autowired
    public WeatherService(WeatherRecordMapper mapper, WeatherReportRepository repository,
                          DataQualityValidator validator){
        this.repository = repository;
        this.mapper = mapper;
        this.qualityValidator = validator;
    }


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

    public List<WeatherRecordResponseDto> getMinMaxTodayTemperature(){
        return repository.findFullObjectsWithMaxValOnLatestDate()
                .stream()
                .map(mapper::weatherEntityToDto)
                .sorted(Comparator.comparingDouble(WeatherRecordResponseDto::getTemperature))
                .toList();
    }

    public WeatherDashboardDto getDashboardSummary(){
        WeatherDashboardDto dto = new WeatherDashboardDto();

        getLatestTodayWeatherRecord().ifPresent(dto::setLatestRecord);

        List<WeatherRecordResponseDto> minMaxTemp = getMinMaxTodayTemperature();

        if(minMaxTemp.size() >= 2){
            dto.setMaxTempRecord(minMaxTemp.getLast());
            dto.setMinTempRecord(minMaxTemp.getFirst());
        }
        if(!minMaxTemp.isEmpty()) {
            log.info("{} {} {}", minMaxTemp.getLast(), minMaxTemp.getFirst(), minMaxTemp.size());
        }

        return dto;
    }

    public Optional<WeatherRecordResponseDto> getLatestTodayWeatherRecord(){
        //TODO: make a time range factory based on specified zone ID

        ZoneId zoneId = ZoneId.systemDefault();

        LocalDate currentDate = LocalDate.now(zoneId);

        Instant startOfTheCurrentDate = currentDate.atStartOfDay(zoneId).toInstant();

        Instant endOfTheCurrentDate = currentDate.plusDays(1).atStartOfDay(zoneId).toInstant();

       return repository.findFirstByMeasuredAtBetweenOrderByMeasuredAtDesc(startOfTheCurrentDate, endOfTheCurrentDate).map(mapper::weatherEntityToDto);
    }

}
