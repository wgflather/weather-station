package com.flather.weatherstation.util;

import com.flather.weatherstation.domain.constant.TrendDirection;
import com.flather.weatherstation.dto.analytics.TrendResult;
import com.flather.weatherstation.dto.projection.DataPoint;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.apache.commons.math3.stat.regression.SimpleRegression;
import org.apache.commons.math3.util.Precision;

public class MeteoMath {

  private static final double TREND_THRESHOLD = 0.15; // °/hour

  /**
   * Magnus coefficients for the dew point, in the Alduchov–Eskridge fit.
   *
   * <p>Public because the history card's dew point is computed in SQL — the smallest spread across
   * a range is a ranking, not a per-row transform — and the two must agree. Several published pairs
   * are in circulation (17.27 / 237.7 is the older Magnus–Tetens) and they disagree by only ~0.02
   * °C, which is exactly why a second copy would go unnoticed: nothing on screen would look wrong,
   * the two definitions would simply drift apart.
   */
  public static final double DEW_POINT_A = 17.625;

  public static final double DEW_POINT_B = 243.04;

  /**
   * Calculates the dew point temperature using the Magnus formula.
   *
   * @param temperature ambient temperature in °C
   * @param humidity relative humidity in % (0–100), strictly above zero — the logarithm is
   *     undefined at 0, and Postgres raises there rather than returning an infinity.
   * @return dew point temperature in °C, rounded to 1 decimal place
   */
  public static double calculateDewPoint(Double temperature, Double humidity) {
    double alpha =
        Math.log(humidity / 100.0) + (DEW_POINT_A * temperature) / (DEW_POINT_B + temperature);
    double dewPoint = (DEW_POINT_B * alpha) / (DEW_POINT_A - alpha);

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

  public static TrendResult calculateTrend(List<DataPoint> dataPoints, ChronoUnit unit) {
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

    double secondsPerUnit = unit.getDuration().getSeconds();
    double changePerUnit = slope * secondsPerUnit;
    changePerUnit = Math.round(changePerUnit * 10.0) / 10.0;

    double threshold = thresholdFor(unit);

    TrendDirection direction;
    if (Math.abs(changePerUnit) < threshold) {
      direction = TrendDirection.STABLE;
      changePerUnit = 0.0;
    } else if (changePerUnit > 0) {
      direction = TrendDirection.UP;
    } else {
      direction = TrendDirection.DOWN;
    }
    return new TrendResult(changePerUnit, direction);
  }

  /**
   * Only hours are supported. A coarser unit needs its own threshold, and scaling a thresholded
   * rate up to a range is the wrong way to get one — see {@link #calculateTotalChange}, which is
   * what range-wide change should use.
   */
  private static double thresholdFor(ChronoUnit unit) {
    return switch (unit) {
      case HOURS -> TREND_THRESHOLD;
      default -> throw new IllegalArgumentException("Unsupported trend unit: " + unit);
    };
  }

  /**
   * Total change across the span the points cover, from the same least-squares fit {@link
   * #calculateTrend} uses.
   *
   * <p>Separate from {@code calculateTrend} because that one rounds and thresholds a <em>rate</em>.
   * Scaling its result up to a range would inherit both: a 0.4 °C/day warming falls under the daily
   * threshold and is reported as stable, yet across 30 days it is a real +12 °C. Here the rounding
   * and the threshold apply to the total, which is what a range card actually claims.
   *
   * @param dataPoints readings across the range; order does not matter, nulls are ignored.
   * @param threshold smallest total change worth calling a direction, in the metric's own unit.
   */
  public static TrendResult calculateTotalChange(List<DataPoint> dataPoints, double threshold) {
    List<DataPoint> points =
        dataPoints.stream().filter(dataPoint -> dataPoint.value() != null).toList();

    if (points.size() < 2) {
      return new TrendResult(0.0, TrendDirection.STABLE);
    }

    Instant earliest = points.stream().map(DataPoint::hour).min(Instant::compareTo).orElseThrow();
    Instant latest = points.stream().map(DataPoint::hour).max(Instant::compareTo).orElseThrow();

    double spanSeconds = Duration.between(earliest, latest).toSeconds();
    if (spanSeconds == 0) {
      return new TrendResult(0.0, TrendDirection.STABLE);
    }

    SimpleRegression regression = new SimpleRegression();
    for (DataPoint point : points) {
      regression.addData(
          Duration.between(earliest, point.hour()).toMillis() / 1000.0, point.value());
    }

    double totalChange = Math.round(regression.getSlope() * spanSeconds * 10.0) / 10.0;

    if (Math.abs(totalChange) < threshold) {
      return new TrendResult(0.0, TrendDirection.STABLE);
    }
    return new TrendResult(totalChange, totalChange > 0 ? TrendDirection.UP : TrendDirection.DOWN);
  }

  public static TrendResult trendFromHourlyChange(double hourlyChange) {
    if (Math.abs(hourlyChange) < TREND_THRESHOLD) {
      return new TrendResult(0.0, TrendDirection.STABLE);
    }
    TrendDirection dir = hourlyChange > 0 ? TrendDirection.UP : TrendDirection.DOWN;
    return new TrendResult(Math.round(hourlyChange * 10.0) / 10.0, dir);
  }

  public static double rawToWetnessPct(double raw, int dryBaseline, int wetBaseline) {
    double range = dryBaseline - wetBaseline;
    double clamped = Math.min(dryBaseline, Math.max(wetBaseline, raw));
    return ((dryBaseline - clamped) / range) * 100.0;
  }
}
