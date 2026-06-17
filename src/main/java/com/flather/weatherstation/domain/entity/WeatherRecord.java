package com.flather.weatherstation.domain.entity;

import com.flather.weatherstation.domain.constant.DataQuality;
import jakarta.persistence.*;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "weather_records")
@AllArgsConstructor
@Builder
@NoArgsConstructor
@Getter
@Setter
@ToString
public class WeatherRecord {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "device_id")
  @NotNull
  private String deviceId;

  private Double temperature;

  private Double pressure;

  private Double humidity;

  private Double surfaceWetness;

  private Double wind;

  @Column(name = "wind_direction")
  private Double windDirection;

  @Column(name = "uv_index")
  private Double uvIndex;

  @NotNull
  @Column(name = "wifi_rssi")
  private Double wifiRssi;

  @Column(name = "humidity_data_quality")
  @Enumerated(EnumType.STRING)
  private DataQuality humidityDataQuality;

  @Column(name = "pressure_data_quality")
  @Enumerated(EnumType.STRING)
  private DataQuality pressureDataQuality;

  @Column(name = "temperature_data_quality")
  @Enumerated(EnumType.STRING)
  private DataQuality temperatureDataQuality;

  @Column(name = "surface_wetness_data_quality")
  @Enumerated(EnumType.STRING)
  private DataQuality surfaceWetnessDataQuality;

  @Column(name = "wind_data_quality")
  @Enumerated(EnumType.STRING)
  private DataQuality windDataQuality;

  @Column(name = "wind_direction_data_quality")
  @Enumerated(EnumType.STRING)
  private DataQuality windDirectionDataQuality;

  @Column(name = "uv_index_data_quality")
  @Enumerated(EnumType.STRING)
  private DataQuality uvIndexDataQuality;

  @CreationTimestamp
  @Column(name = "measured_at")
  private Instant measuredAt;
}
