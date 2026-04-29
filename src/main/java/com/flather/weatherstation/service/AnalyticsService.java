package com.flather.weatherstation.service;

import com.flather.weatherstation.model.dto.*;
import com.flather.weatherstation.model.constant.DataStatus;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import jakarta.persistence.criteria.CriteriaBuilder;
import lombok.RequiredArgsConstructor;

import org.decimal4j.util.DoubleRounder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AnalyticsService {
    private final WeatherReportRepository repository;
    private final WeatherRecordMapper mapper;

    private WeatherAvgDto roundAvgData(WeatherAvgDto data, int precision){

        return WeatherAvgDto.builder()
                .avgTemperature(DoubleRounder.round(data.getAvgTemperature(), precision))
                .avgPressure(DoubleRounder.round(data.getAvgPressure(), precision))
                .build();
    }

    private double roundDouble(Double data, int precision){
        return DoubleRounder.round(data, precision);
    }

    private ZonedDateTime instantTOZoned(Instant instant){
        return instant.atZone(ZoneId.systemDefault());
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
        List<MinMaxProjection> minMaxTemp = repository.findFullObjectsWithMinMaxTempOnLatestDate();

        if(minMaxTemp.size() != 2){
            return Optional.empty();
        }

        MinMaxProjection min = minMaxTemp.get(0);
        MinMaxProjection max = minMaxTemp.get(1);

        return Optional.of(
                MinMaxValueDto.builder()
                .maxValue(max.value())
                .minValue(min.value())
                .maxAt(instantTOZoned(max.time()))
                .minAt(instantTOZoned(min.time()))
                .build()
        );

    }

    public WeatherAvgDto getAvgRoundedMetricsData(){

        WeatherAvgDto latestAvg = repository.findLatestAvgComparedToNow();

        //Use latest available data in database if no records arrived in last 5 minutes
        WeatherAvgDto avgDto = ( latestAvg != null &&
                latestAvg.getAvgPressure() != null &&
                latestAvg.getAvgTemperature() != null) ?
                latestAvg : repository.findLatestAvailableAvg();

        return roundAvgData(avgDto, 1);
    }

    public List<HourlyChartAvgDto> getHourlyTemperatureChartData(){
        return repository.findTodayHourlyTemperature().stream()
                .map(projection ->
                     new HourlyChartAvgDto(instantTOZoned(projection.hour()),
                             roundDouble(projection.value(), 2))
                )
                .toList();
    }

}
