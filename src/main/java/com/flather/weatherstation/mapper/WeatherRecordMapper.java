package com.flather.weatherstation.mapper;

import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;

@Mapper(componentModel = "spring")
public interface WeatherRecordMapper {

  WeatherRecord weatherDtoToEntity(WeatherRecordCreatedDto dto);

  @Mapping(target = "measuredAtTimeZoned", source = "measuredAt", qualifiedByName = "toZoned")
  WeatherRecordResponseDto weatherEntityToDto(WeatherRecord entity);

  @Named("toZoned")
  static ZonedDateTime toZoned(Instant createdAt) {
    return ZonedDateTime.ofInstant(createdAt, ZoneId.of("Europe/Kiev"));
  }
}
