package com.flather.weatherstation.service;

import com.flather.weatherstation.config.TimezoneProperties;
import com.flather.weatherstation.dto.analytics.*;
import com.flather.weatherstation.repository.WeatherReportRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class AnalyticsService {
    private final WeatherReportRepository repository;
    private final ZoneId zoneId;

    public AnalyticsService(WeatherReportRepository repository, TimezoneProperties timezoneProperties) {
        this.repository = repository;
        zoneId = ZoneId.of(timezoneProperties.getZoneId());
    }


    public long findTodayRecordsCount(){
        return repository.findRecordsToday();
    }

    public Optional<ZonedDateTime> findLastRecordTime(){
        return Optional.ofNullable(repository.findMaxMeasuredAt())
                .map(t -> t.atZone(zoneId));
    }

    public long getLagMinutes(ZonedDateTime lastRecord){
        return Duration.between(lastRecord,
                Instant.now().atZone(zoneId))
                .toMinutes();
    }

    public TemperatureDto getTemperature(){
        return repository.getTemperature();
    }

    public PressureDto getPressure(){
        return repository.getPressure();
    }


    public List<HourlyChartAvgDto> getHourlyTemperatureChartData(){
        return repository.findTodayHourlyTemperature().stream()
                .map(projection ->
                     new HourlyChartAvgDto(projection.hour().atZone(zoneId), projection.value())
                )
                .toList();
    }

}
