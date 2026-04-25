package com.flather.weatherstation.model.dto;

import lombok.Builder;

import java.time.ZonedDateTime;


@Builder
public record MinMaxValueDto(double maxValue,  double minValue,
         ZonedDateTime maxAt, ZonedDateTime minAt){

}
