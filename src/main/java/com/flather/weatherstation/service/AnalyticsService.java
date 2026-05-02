package com.flather.weatherstation.service;

import com.flather.weatherstation.config.TimezoneProperties;
import com.flather.weatherstation.dto.analytics.HourlyChartAvgDto;
import com.flather.weatherstation.dto.analytics.MinMaxValueDto;
import com.flather.weatherstation.dto.analytics.WeatherAvgDto;
import com.flather.weatherstation.dto.projection.MinMaxProjection;
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

    public MinMaxValueDto getMinMaxTodayTemperature(){
        List<MinMaxProjection> minMaxTemp = repository.findMinMaxTemp();

        if(minMaxTemp.isEmpty()){
            return MinMaxValueDto.builder().build();
        }

        MinMaxProjection min = minMaxTemp.get(0);
        MinMaxProjection max = minMaxTemp.get(1);

        return MinMaxValueDto.builder()
                .maxValue(max.value())
                .minValue(min.value())
                .maxAt(max.time().atZone(zoneId))
                .minAt(min.time().atZone(zoneId))
                .build();

    }

    public WeatherAvgDto getAvgRoundedMetricsData(){

        WeatherAvgDto latestAvg = repository.findLatestAvgComparedToNow();

        //Use latest available data in database if no records arrived in last 5 minutes
        return (latestAvg != null &&
                latestAvg.getAvgPressure() != null &&
                latestAvg.getAvgTemperature() != null) ?
                latestAvg : repository.findLatestAvailableAvg();

    }

    public List<HourlyChartAvgDto> getHourlyTemperatureChartData(){
        return repository.findTodayHourlyTemperature().stream()
                .map(projection ->
                     new HourlyChartAvgDto(projection.hour().atZone(zoneId), projection.value())
                )
                .toList();
    }

}
