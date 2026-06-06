package com.flather.weatherstation.converter;

import com.flather.weatherstation.domain.constant.Metric;
import org.springframework.core.convert.converter.Converter;
import org.springframework.stereotype.Component;

@Component
public class MetricConverter implements Converter<String, Metric> {
  @Override
  public Metric convert(String apiKey) {
    return Metric.fromApiKey(apiKey);
  }
}
