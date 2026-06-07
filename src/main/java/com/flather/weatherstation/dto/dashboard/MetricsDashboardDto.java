package com.flather.weatherstation.dto.dashboard;

import com.flather.weatherstation.dto.analytics.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.RequiredArgsConstructor;

@Builder
@Data
@AllArgsConstructor
@RequiredArgsConstructor
public class MetricsDashboardDto {
  private TemperatureDto temperature;
  private PressureDto pressure;
  private HumidityDto humidity;
  private SurfaceWetnessDto surfaceWetness;

  public static MetricsDashboardDto empty() {
    return MetricsDashboardDto.builder().build();
  }
}
