package com.flather.weatherstation.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;

import java.time.ZonedDateTime;


@Builder
public record MinMaxValueDto(double maxValue,  double minValue,
         ZonedDateTime maxAt, ZonedDateTime minAt){

}
