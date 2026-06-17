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

  public String generateApiQueryParam() {
    return Stream.of(
            Map.entry(Metric.TEMPERATURE, temperature),
            Map.entry(Metric.PRESSURE, pressure),
            Map.entry(Metric.HUMIDITY, humidity),
            Map.entry(Metric.WIND, wind),
            Map.entry(Metric.UV_INDEX, uvIndex))
        .filter(e -> e.getValue() == DataProvider.EXTERNAL_API)
        .map(e -> e.getKey().getProviderKeys())
        .filter(Objects::nonNull)
        .flatMap(List::stream)
        .distinct()
        .collect(Collectors.joining(","));
  }
}
