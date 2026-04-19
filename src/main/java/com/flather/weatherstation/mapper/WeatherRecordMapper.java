package com.flather.weatherstation.mapper;

import com.flather.weatherstation.entity.WeatherRecord;
import com.flather.weatherstation.entity.WeatherRecordDto;
import org.mapstruct.Mapper;

@Mapper
public interface WeatherRecordMapper {

    WeatherRecord weatherDtoToEntity(WeatherRecordDto dto);
    WeatherRecordDto weatherEntityToDto(WeatherRecord entity);
}
