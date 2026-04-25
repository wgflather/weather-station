package com.flather.weatherstation.service;

import com.flather.weatherstation.entity.*;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.*;
import java.util.List;
import java.util.Optional;

@Service
@Slf4j
@RequiredArgsConstructor
public class WeatherService {
    private final WeatherReportRepository repository;
    private final DataQualityValidator qualityValidator;
    private final WeatherRecordMapper mapper;
    private final AnalyticsService analyticsService;


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


    public WeatherDashboardDto getDashboardSummary() {
        Instant latestRecordTime = repository.findMaxMeasuredAt();
        // Check for empty database
        if(latestRecordTime == null){
            return WeatherDashboardDto
                    .builder()
                    .status(DataStatus.EMPTY)
                    .build();
        }

        ZonedDateTime latestRecordTimeZoned = latestRecordTime.atZone(ZoneId.systemDefault());
        long lagMinutes = Duration.between(latestRecordTime, Instant.now()).toMinutes();
        DataStatus status = analyticsService.setStatus(lagMinutes);

        Optional<MinMaxValueDto> minMaxValueDto = analyticsService.getMinMaxTodayTemperature();

        //Use latest available data in database if no records arrived in last 5 minutes
        WeatherAvgDto averages = analyticsService.getAvgRoundedMetricsData();

        return WeatherDashboardDto.builder()
                .averages(averages)
                .lagMinutes(lagMinutes)
                .lastMeasuredAt(latestRecordTimeZoned)
                .minMaxValue(minMaxValueDto.orElse(null))
                .recordsToday(repository.findRecordsToday())
                .status(status)
                .build();
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
