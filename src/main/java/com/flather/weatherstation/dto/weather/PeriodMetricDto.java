package com.flather.weatherstation.dto.weather;

import com.flather.weatherstation.domain.constant.DayPeriod;
import lombok.*;

@AllArgsConstructor
@NoArgsConstructor
@Builder
@Data
public class PeriodMetricDto {

  private String deviceId;

  private Double temperatureMin;
  private Double temperatureMax;
  private Double temperatureAvg;

  private Double pressureMin;
  private Double pressureMax;
  private Double pressureAvg;

  private Double humidityMin;
  private Double humidityMax;
  private Double humidityAvg;

  private Double surfaceWetnessMin;
  private Double surfaceWetnessMax;
  private Double surfaceWetnessAvg;

  private Double uvIndexMax;
  private Double uvIndexAvg;

  private Double windSpeedMin;
  private Double windSpeedMax;
  private Double windSpeedAvg;

  private DayPeriod period;
}
