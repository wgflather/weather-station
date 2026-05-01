package com.flather.weatherstation.service;

import com.flather.weatherstation.config.TimezoneProperties;
import com.flather.weatherstation.model.dto.*;
import com.flather.weatherstation.model.constant.DataStatus;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import jakarta.persistence.criteria.CriteriaBuilder;
import lombok.RequiredArgsConstructor;

import org.springframework.beans.factory.annotation.Value;
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

    public ZonedDateTime findLastRecordTime(){
        return repository.findMaxMeasuredAt().atZone(zoneId);
    }

    public long getLagMinutes(){
        Instant lastMeasurement = repository.findMaxMeasuredAt();

        return Duration.between(lastMeasurement.atZone(zoneId),
                Instant.now().atZone(zoneId))
                .toMinutes();
    }

    public MinMaxValueDto getMinMaxTodayTemperature(){
        List<MinMaxProjection> minMaxTemp = repository.findMinMaxTemp();

        MinMaxProjection min = minMaxTemp.get(0);
        MinMaxProjection max = minMaxTemp.get(1);

        return Optional.of(
                MinMaxValueDto.builder()
                .maxValue(max.value())
                .minValue(min.value())
                .maxAt(max.time().atZone(zoneId))
                .minAt(min.time().atZone(zoneId))
                .build()
        ).orElse(null);

    }

    public WeatherAvgDto getAvgRoundedMetricsData(){

        WeatherAvgDto latestAvg = repository.findLatestAvgComparedToNow();

        //Use latest available data in database if no records arrived in last 5 minutes
        return ( latestAvg != null &&
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
