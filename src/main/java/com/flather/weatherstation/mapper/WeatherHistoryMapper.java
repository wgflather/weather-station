package com.flather.weatherstation.mapper;

import com.flather.weatherstation.domain.entity.DailyWeatherRecord;
import com.flather.weatherstation.domain.entity.HourlyWeatherRecord;
import com.flather.weatherstation.dto.projection.DailySummaryProjection;
import com.flather.weatherstation.dto.weather.DailyWeatherRecordDto;
import com.flather.weatherstation.dto.weather.HourlyWeatherRecordDto;
import java.util.List;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface WeatherHistoryMapper {

  HourlyWeatherRecordDto toDto(HourlyWeatherRecord entity);

  List<HourlyWeatherRecordDto> toHourlyDtoList(List<HourlyWeatherRecord> entities);

  DailyWeatherRecordDto toDto(DailyWeatherRecord entity);

  List<DailyWeatherRecordDto> toDailyDtoList(List<DailyWeatherRecord> entities);

  @Mapping(target = "date", ignore = true)
  @Mapping(target = "deviceId", ignore = true)
  DailyWeatherRecordDto toDto(DailySummaryProjection projection);
}
