package com.flather.weatherstation.service;

import com.flather.weatherstation.config.TimezoneProperties;
import com.flather.weatherstation.model.dto.*;
import com.flather.weatherstation.model.constant.DataStatus;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import lombok.RequiredArgsConstructor;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.*;

@Service
@Transactional(readOnly = true)
public class AnalyticsService {
    private final WeatherReportRepository repository;
    private final TimezoneProperties timezoneProperties;
    private final ZoneId zoneId;

    public AnalyticsService(WeatherReportRepository repository, TimezoneProperties timezoneProperties) {
        this.repository = repository;
        this.timezoneProperties = timezoneProperties;
        zoneId = ZoneId.of(timezoneProperties.getZoneId());
    }




    public DataStatus setStatus(long lagMinutes){
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

    public Optional<MinMaxValueDto> getMinMaxTodayTemperature(){
        List<MinMaxProjection> minMaxTemp = repository.findMinMaxTemp();

        if(minMaxTemp.size() != 2){
            return Optional.empty();
        }

        MinMaxProjection min = minMaxTemp.get(0);
        MinMaxProjection max = minMaxTemp.get(1);

        return Optional.of(
                MinMaxValueDto.builder()
                .maxValue(max.value())
                .minValue(min.value())
                .maxAt(max.time().atZone(zoneId))
                .minAt(min.time().atZone(zoneId))
                .build()
        );

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
