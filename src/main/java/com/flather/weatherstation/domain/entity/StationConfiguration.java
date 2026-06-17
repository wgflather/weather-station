package com.flather.weatherstation.domain.entity;

import com.flather.weatherstation.domain.constant.DataProvider;
import jakarta.persistence.*;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "station_configuration")
@Getter
@Setter
public class StationConfiguration {
  @Id private Long id = 1L;

  @Column(nullable = false)
  @NotNull
  @DecimalMin("-90.0")
  @DecimalMax("90.0")
  private Double latitude;

  @Column(nullable = false)
  @NotNull
  @DecimalMin("-180.0")
  @DecimalMax("180.0")
  private Double longitude;

  @Column(nullable = false)
  @DecimalMin("-500.0")
  @DecimalMax("10000.0")
  private Double elevation = 0.0;

  private String board;
  private String temperatureSensor;
  private String humiditySensor;
  private String pressureSensor;
  private String surfaceWetnessSensor;
  private String windSensor;
  private String uvIndexSensor;

  private Double tempMinimal;
  private Double tempMaximum;

  private Double pressureMinimal;
  private Double pressureMaximum;

  private Double humidityMinimal;
  private Double humidityMaximum;

  private Double humiditySpikeLimit;
  private Double tempSpikeLimit;
  private Double pressureSpikeLimit;

  private Integer surfaceWetnessWetBaseline;
  private Integer surfaceWetnessDryBaseline;

  private Double windMinimal;
  private Double windMaximum;
  private Double windSpikeLimit;

  @Column(name = "uv_index_minimal")
  private Double uvIndexMinimal;

  @Column(name = "uv_index_maximum")
  private Double uvIndexMaximum;

  @Column(name = "uv_index_spike_limit")
  private Double uvIndexSpikeLimit;

  @Enumerated(EnumType.STRING)
  @Column(name = "temperature_provider", nullable = false)
  private DataProvider temperatureProvider;

  @Enumerated(EnumType.STRING)
  @Column(name = "pressure_provider", nullable = false)
  private DataProvider pressureProvider;

  @Enumerated(EnumType.STRING)
  @Column(name = "humidity_provider", nullable = false)
  private DataProvider humidityProvider;

  @Enumerated(EnumType.STRING)
  @Column(name = "wind_provider", nullable = false)
  private DataProvider windProvider;

  @Enumerated(EnumType.STRING)
  @Column(name = "uv_index_provider", nullable = false)
  private DataProvider uvIndexProvider;

  private Instant createdAt;
  private Instant updatedAt;
}
