package com.flather.weatherstation.dto.analytics;

import lombok.Builder;

import java.time.ZonedDateTime;


@Builder
public record MinMaxValueDto(Double maxValue,  Double minValue,
         ZonedDateTime maxAt, ZonedDateTime minAt){

}
