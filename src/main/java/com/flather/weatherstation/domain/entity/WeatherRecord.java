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

  @Column(name = "data_quality")
  @Enumerated(EnumType.STRING)
  private DataQuality dataQuality;

  @CreationTimestamp
  @Column(name = "measured_at")
  private Instant measuredAt;
}
