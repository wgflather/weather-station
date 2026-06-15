package com.flather.weatherstation.domain.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;
import lombok.*;

@Entity
@Table(name = "daily_weather_record")
@AllArgsConstructor
@NoArgsConstructor
@Builder
@Getter
@Setter
public class DailyWeatherRecord {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "device_id")
  @NotNull
  private String deviceId;

  @Column(name = "temperature_min")
  private Double temperatureMin;

  @Column(name = "temperature_max")
  private Double temperatureMax;

  @Column(name = "temperature_avg")
  private Double temperatureAvg;

  @Column(name = "pressure_min")
  private Double pressureMin;

  @Column(name = "pressure_max")
  private Double pressureMax;

  @Column(name = "pressure_avg")
  private Double pressureAvg;

  @Column(name = "humidity_min")
  private Double humidityMin;

  @Column(name = "humidity_max")
  private Double humidityMax;

  @Column(name = "humidity_avg")
  private Double humidityAvg;

  @Column(name = "surface_wetness_min")
  private Double surfaceWetnessMin;

  @Column(name = "surface_wetness_max")
  private Double surfaceWetnessMax;

  @Column(name = "surface_wetness_avg")
  private Double surfaceWetnessAvg;

  @Column(name = "date")
  @NotNull
  private LocalDate date;
}
