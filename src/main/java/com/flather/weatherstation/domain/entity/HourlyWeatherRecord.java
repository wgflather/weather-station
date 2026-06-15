package com.flather.weatherstation.domain.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import lombok.*;

@Entity
@Table(name = "hourly_weather_record")
@AllArgsConstructor
@NoArgsConstructor
@Builder
@Getter
@Setter
public class HourlyWeatherRecord {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "device_id")
  @NotNull
  private String deviceId;

  @Column(name = "temperature_avg")
  private Double temperatureAvg;

  @Column(name = "pressure_avg")
  private Double pressureAvg;

  @Column(name = "humidity_avg")
  private Double humidityAvg;

  @Column(name = "surface_wetness_avg")
  private Double surfaceWetnessAvg;

  @Column(name = "hour")
  @NotNull
  private Instant hour;
}
