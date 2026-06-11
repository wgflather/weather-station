package com.flather.weatherstation.service;

import com.flather.weatherstation.domain.constant.TrendDirection;
import com.flather.weatherstation.dto.analytics.TrendResult;
import com.flather.weatherstation.dto.projection.DataPoint;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import org.apache.commons.math3.stat.descriptive.rank.Median;
import org.apache.commons.math3.stat.regression.SimpleRegression;
import org.apache.commons.math3.util.Precision;

public class MeteoMath {

  private static final double TREND_THRESHOLD = 0.15;

  /**
   * Calculates the dew point temperature using the Magnus formula.
   *
   * @param temperature ambient temperature in °C
   * @param humidity relative humidity in % (0–100)
   * @return dew point temperature in °C, rounded to 1 decimal place
   */
  public static double calculateDewPoint(Double temperature, Double humidity) {
    final double a = 17.625;
    final double b = 243.04;

    double alpha = Math.log(humidity / 100.0) + (a * temperature) / (b + temperature);
    double dewPoint = (b * alpha) / (a - alpha);

    return Math.round(dewPoint * 10.0) / 10.0;
  }

  public static Double average(Collection<Double> values, int limit) {
    OptionalDouble avg =
        values.stream()
            .filter(Objects::nonNull)
            .limit(limit)
            .mapToDouble(Double::doubleValue)
            .average();

    return avg.isPresent() ? Precision.round(avg.getAsDouble(), 1) : null;
  }

  public static TrendResult calculateTrend(List<DataPoint> dataPoints) {
    if (dataPoints.isEmpty()) {
      return new TrendResult(0.0, TrendDirection.STABLE);
    }

    List<DataPoint> filteredPoints =
        dataPoints.stream().filter(dataPoint -> dataPoint.value() != null).toList();

    if (filteredPoints.size() < 2) {
      return new TrendResult(0.0, TrendDirection.STABLE);
    }

    Instant firstDataTime = filteredPoints.getFirst().hour();

    SimpleRegression regression = new SimpleRegression();

    for (DataPoint point : filteredPoints) {
      double x = Duration.between(firstDataTime, point.hour()).toMillis() / 1000.0;

      double y = point.value();

      regression.addData(x, y);
    }

    double slope = regression.getSlope();

    double hourlyChange = slope * 3600.0;

    hourlyChange = Math.round(hourlyChange * 10.0) / 10.0;

    TrendDirection direction;

    if (Math.abs(hourlyChange) < TREND_THRESHOLD) {
      direction = TrendDirection.STABLE;
      hourlyChange = 0.0;
    } else if (hourlyChange > 0) {
      direction = TrendDirection.UP;
    } else {
      direction = TrendDirection.DOWN;
    }
    return new TrendResult(hourlyChange, direction);
  }

  public static double rawToWetnessPct(long raw, int dryBaseline, int wetBaseline) {
    double range = dryBaseline - wetBaseline;
    double clamped = Math.min(dryBaseline, Math.max(wetBaseline, raw));
    return ((dryBaseline - clamped) / range) * 100.0;
  }

  private static Double medianOf(Deque<Double> spikeWindow) {
    Median median = new Median();
    return median.evaluate(spikeWindow.stream().mapToDouble(Double::doubleValue).toArray());
  }
}
