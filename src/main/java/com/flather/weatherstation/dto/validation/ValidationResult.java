package com.flather.weatherstation.dto.validation;

import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.constant.Metric;

public record ValidationResult(
    DataQuality temperature, DataQuality pressure, DataQuality humidity) {
  public DataQuality getByMetric(Metric metric) {
    return switch (metric) {
      case TEMPERATURE -> temperature;
      case PRESSURE -> pressure;
      case HUMIDITY -> humidity;
      default -> throw new IllegalArgumentException("Unknown Metric");
    };
  }
}
