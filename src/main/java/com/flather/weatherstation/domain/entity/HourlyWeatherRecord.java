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

  @Column(name = "uv_index_avg")
  private Double uvIndexAvg;

  @Column(name = "wind_speed_avg")
  private Double windSpeedAvg;

  // Peak of the reported samples in the hour, not a meteorological gust — the station sends one
  // scalar wind value per report and has no 3-second peak to send.
  @Column(name = "wind_speed_max")
  private Double windSpeedMax;

  // Unit-vector mean bearing in [0, 360), null when the hour's bearings cancelled out.
  @Column(name = "wind_direction_avg")
  private Double windDirectionAvg;

  // Length of that mean vector, 0..1: ~0.95 is a steady bearing, ~0.1 means the wind boxed the
  // compass and wind_direction_avg should not be presented as if it meant anything.
  @Column(name = "wind_direction_consistency")
  private Double windDirectionConsistency;

  @Column(name = "hour")
  @NotNull
  private Instant hour;
}
