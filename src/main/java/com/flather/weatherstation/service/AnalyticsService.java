package com.flather.weatherstation.service;

import com.flather.weatherstation.model.dto.MinMaxValueDto;
import com.flather.weatherstation.model.dto.WeatherAvgDto;
import com.flather.weatherstation.model.dto.WeatherRecordResponseDto;
import com.flather.weatherstation.model.constant.DataStatus;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import lombok.RequiredArgsConstructor;

import org.decimal4j.util.DoubleRounder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

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
        List<WeatherRecordResponseDto> minMaxTemp = repository.findFullObjectsWithMinMaxTempOnLatestDate()
                .stream()
                .map(mapper::weatherEntityToDto)
                .toList();

        if(minMaxTemp.size() < 2){
            return Optional.empty();
        }

        WeatherRecordResponseDto min = minMaxTemp
                .stream()
                .min(Comparator.comparingDouble(WeatherRecordResponseDto::getTemperature))
                .get();

        WeatherRecordResponseDto max = minMaxTemp
                .stream()
                .max(Comparator.comparingDouble(WeatherRecordResponseDto::getTemperature))
                .get();

        return Optional.of(
                MinMaxValueDto.builder()
                .maxValue(max.getTemperature())
                .minValue(min.getTemperature())
                .maxAt(max.getMeasuredAtTimeZoned())
                .minAt(min.getMeasuredAtTimeZoned())
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

}
