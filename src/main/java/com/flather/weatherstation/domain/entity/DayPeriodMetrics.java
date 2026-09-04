package com.flather.weatherstation.domain.entity;

import static com.flather.weatherstation.domain.constant.Metric.UV_INDEX;

import com.flather.weatherstation.domain.constant.DayPeriod;
import com.flather.weatherstation.domain.constant.Metric;
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
public class DayPeriodMetrics {

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

  @Column(name = "uv_index_max")
  private Double uvIndexMax;

  @Column(name = "uv_index_avg")
  private Double uvIndexAvg;

  @Column(name = "wind_speed_min")
  private Double windSpeedMin;

  @Column(name = "wind_speed_max")
  private Double windSpeedMax;

  @Column(name = "wind_speed_avg")
  private Double windSpeedAvg;

  @Column(name = "period")
  @Enumerated(EnumType.STRING)
  private DayPeriod period;

  @Column(name = "date")
  @NotNull
  private LocalDate date;

  public Double getMinByMetric(Metric metric) {
    return switch (metric) {
      case TEMPERATURE -> temperatureMin;
      case PRESSURE -> pressureMin;
      case HUMIDITY -> humidityMin;
      case SURFACE_WETNESS -> surfaceWetnessMin;
      case WIND -> windSpeedMin;
      case UV_INDEX -> null; // no min tracked for UV
      default -> throw new IllegalArgumentException("Not supported metric");
    };
  }

  public Double getMaxByMetric(Metric metric) {
    return switch (metric) {
      case TEMPERATURE -> temperatureMax;
      case PRESSURE -> pressureMax;
      case HUMIDITY -> humidityMax;
      case SURFACE_WETNESS -> surfaceWetnessMax;
      case WIND -> windSpeedMax;
      case UV_INDEX -> uvIndexMax;
      default -> throw new IllegalArgumentException("Not supported metric");
    };
  }

  public Double getAvgByMetric(Metric metric) {
    return switch (metric) {
      case TEMPERATURE -> temperatureAvg;
      case PRESSURE -> pressureAvg;
      case HUMIDITY -> humidityAvg;
      case SURFACE_WETNESS -> surfaceWetnessAvg;
      case WIND -> windSpeedAvg;
      case UV_INDEX -> uvIndexAvg;
      default -> throw new IllegalArgumentException("Not supported metric");
    };
  }
}
