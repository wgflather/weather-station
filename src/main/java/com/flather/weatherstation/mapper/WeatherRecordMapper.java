package com.flather.weatherstation.mapper;

import com.flather.weatherstation.entity.WeatherRecord;
import com.flather.weatherstation.entity.WeatherRecordCreatedDto;
import com.flather.weatherstation.entity.WeatherRecordResponseDto;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;

@Mapper
public interface WeatherRecordMapper {

    WeatherRecord weatherDtoToEntity(WeatherRecordCreatedDto dto);

    @Mapping(target = "measuredAtTimeZoned",source = "measuredAt", qualifiedByName = "toZoned")
    WeatherRecordResponseDto weatherEntityToDto(WeatherRecord entity);

    @Named("toZoned")
    static ZonedDateTime toZoned(Instant createdAt){
        return ZonedDateTime.ofInstant(createdAt, ZoneId.of("Europe/Kiev"));
    }
}
