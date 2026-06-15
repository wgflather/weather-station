package com.flather.weatherstation.mapper;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import java.time.Instant;
import java.time.ZonedDateTime;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;
import org.springframework.beans.factory.annotation.Autowired;

@Mapper(componentModel = "spring")
public abstract class WeatherRecordMapper {

  @Autowired protected ConfigurationCache configurationCache;

  public abstract WeatherRecord weatherDtoToEntity(WeatherRecordCreatedDto dto);

  @Mapping(target = "measuredAtTimeZoned", source = "measuredAt", qualifiedByName = "toZoned")
  public abstract WeatherRecordResponseDto weatherEntityToDto(WeatherRecord entity);

  @Named("toZoned")
  ZonedDateTime toZoned(Instant measuredAt) {
    return ZonedDateTime.ofInstant(measuredAt, configurationCache.getLocationContext().zoneId());
  }
}
