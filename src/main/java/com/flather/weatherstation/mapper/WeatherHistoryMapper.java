package com.flather.weatherstation.mapper;

import com.flather.weatherstation.domain.entity.DayPeriodMetrics;
import com.flather.weatherstation.domain.entity.HourlyWeatherRecord;
import com.flather.weatherstation.dto.weather.HourlyWeatherRecordDto;
import com.flather.weatherstation.dto.weather.PeriodMetricDto;
import java.util.List;
import org.mapstruct.Mapper;

@Mapper(componentModel = "spring")
public interface WeatherHistoryMapper {

  HourlyWeatherRecordDto toDto(HourlyWeatherRecord entity);

  List<HourlyWeatherRecordDto> toHourlyDtoList(List<HourlyWeatherRecord> entities);

  PeriodMetricDto toDto(DayPeriodMetrics entity);

  List<PeriodMetricDto> toDailyDtoList(List<DayPeriodMetrics> entities);
}
