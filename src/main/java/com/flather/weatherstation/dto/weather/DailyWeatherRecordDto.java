package com.flather.weatherstation.dto.weather;

import java.time.LocalDate;
import lombok.*;

@AllArgsConstructor
@NoArgsConstructor
@Builder
@Data
public class DailyWeatherRecordDto {

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

  private LocalDate date;
}
