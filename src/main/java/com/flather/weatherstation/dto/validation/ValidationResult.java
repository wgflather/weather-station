package com.flather.weatherstation.dto.validation;

import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.constant.Metric;

public record ValidationResult(
    DataQuality temperature,
    DataQuality pressure,
    DataQuality humidity,
    DataQuality surfaceWetness,
    DataQuality wind,
    DataQuality windDirection,
    DataQuality uvIndex) {
  public DataQuality getByMetric(Metric metric) {
    return switch (metric) {
      case TEMPERATURE -> temperature;
      case PRESSURE -> pressure;
      case HUMIDITY -> humidity;
      case SURFACE_WETNESS -> surfaceWetness;
      case WIND -> wind;
      case WIND_DIRECTION -> windDirection;
      case UV_INDEX -> uvIndex;
    };
  }
}
