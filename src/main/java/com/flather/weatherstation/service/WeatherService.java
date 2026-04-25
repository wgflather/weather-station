package com.flather.weatherstation.service;

import com.flather.weatherstation.entity.*;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import lombok.extern.slf4j.Slf4j;
import org.decimal4j.util.DoubleRounder;
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


    public List<WeatherRecordResponseDto> getMaxTodayTemperature(){
        return repository.findFullObjectsWithMaxValOnLatestDate()
                .stream()
                .map(mapper::weatherEntityToDto)
                .sorted(Comparator.comparingDouble(WeatherRecordResponseDto::getTemperature))
                .toList();
    }


    public WeatherDashboardDto getDashboardSummary() {
        Instant latestRecordTime = repository.findMaxMeasuredAt();

        if(latestRecordTime == null){
            return WeatherDashboardDto
                    .builder()
                    .status(DataStatus.EMPTY)
                    .build();
        }
        ZonedDateTime latestRecordTimeZoned = latestRecordTime.atZone(ZoneId.systemDefault());

        long lagMinutes = Duration.between(latestRecordTime, Instant.now()).toMinutes();
        DataStatus status = setStatus(lagMinutes);
        WeatherAvgDto latestAvg = repository.findLatestAvgComparedToNow();
        List<WeatherRecordResponseDto> minMaxTemp = getMaxTodayTemperature();

        WeatherAvgDto averages = (latestAvg.getAvgPressure() != null && latestAvg.getAvgTemperature() != null)
                ? latestAvg : repository.findLatestAvailableAvg();

        roundAvgData(averages, 2);

        return WeatherDashboardDto.builder()
                .averages(averages)
                .lagMinutes(lagMinutes)
                .lastMeasuredAt(latestRecordTimeZoned)
                .maxTodayTempRecord(minMaxTemp.getLast())
                .minTodayTempRecord(minMaxTemp.getFirst())
                .recordsToday(repository.findRecordsToday())
                .status(status)
                .build();
    }

    private void roundAvgData(WeatherAvgDto data, int precision){
        data.setAvgPressure(DoubleRounder.round(data.getAvgPressure(), precision));
        data.setAvgTemperature(DoubleRounder.round(data.getAvgTemperature(), precision));
    }

    private DataStatus setStatus(long lagMinutes){
        if(lagMinutes < 5){
             return DataStatus.LIVE;
        } else if (lagMinutes < 10) {
            return DataStatus.DELAYED;
        } else if (lagMinutes < 1440) {
            return DataStatus.STALE;
        } else {
            return DataStatus.OFFLINE;
        }
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
