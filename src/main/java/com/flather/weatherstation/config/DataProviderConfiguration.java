package com.flather.weatherstation.config;

import com.flather.weatherstation.domain.constant.DataProvider;
import com.flather.weatherstation.domain.constant.Metric;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import java.util.stream.Stream;

public record DataProviderConfiguration(
    DataProvider temperature,
    DataProvider pressure,
    DataProvider humidity,
    DataProvider wind,
    DataProvider uvIndex) {

  private Stream<Map.Entry<Metric, DataProvider>> getProviders() {
    return Stream.of(
        Map.entry(Metric.TEMPERATURE, temperature),
        Map.entry(Metric.PRESSURE, pressure),
        Map.entry(Metric.HUMIDITY, humidity),
        Map.entry(Metric.WIND, wind),
        Map.entry(Metric.UV_INDEX, uvIndex));
  }

  /**
   * The provider backing a metric. Total over {@link Metric} — every metric resolves to a real
   * provider, and the switch is deliberately left without a {@code default} so that adding a metric
   * is a compile error here rather than a silent null.
   */
  public DataProvider getProviderByMetric(Metric metric) {
    return switch (metric) {
      case TEMPERATURE -> temperature;
      case HUMIDITY -> humidity;
      case PRESSURE -> pressure;
      case UV_INDEX -> uvIndex;

      // Direction is a facet of the wind reading rather than an independently sourced metric:
      // Metric.WIND already lists wind_direction_10m among its provider keys, so switching wind to
      // the API switches the whole vector. Sourcing speed and direction separately would present a
      // composite WindDto assembled from two places measuring different air.
      case WIND, WIND_DIRECTION -> wind;

      // Open-Meteo exposes no surface-wetness equivalent — Metric.SURFACE_WETNESS carries no
      // provider keys at all — so it can only ever come from the station's own sensor.
      case SURFACE_WETNESS -> DataProvider.LOCAL_SENSOR;
    };
  }

  public String generateApiQueryParam() {
    return getProviders()
        .filter(e -> e.getValue() == DataProvider.EXTERNAL_API)
        .map(e -> e.getKey().getProviderKeys())
        .filter(Objects::nonNull)
        .flatMap(List::stream)
        .distinct()
        .collect(Collectors.joining(","));
  }

  public boolean usesExternalProvider() {
    return getProviders().anyMatch(c -> c.getValue().equals(DataProvider.EXTERNAL_API));
  }
}
