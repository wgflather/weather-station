package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.domain.constant.CardKind;
import com.flather.weatherstation.domain.constant.DayPeriod;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.DayPeriodMetrics;
import com.flather.weatherstation.dto.analytics.MetricSummary;
import com.flather.weatherstation.dto.analytics.SummaryCard;
import com.flather.weatherstation.dto.analytics.TrendResult;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.util.MeteoMath;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.DoubleUnaryOperator;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Builds the stat cards above the history chart from a range of daily rollup rows.
 *
 * <p>Which period a metric reads is a per-metric decision, not a default: temperature reads the
 * daytime rows because that is what "warmest day" means, while pressure and humidity read the whole
 * day because their extremes fall outside daylight — a depression bottoming out at 03:00, a
 * humidity peak before dawn. Each builder states its own reasoning.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SummaryCardService {

  /**
   * Smallest total change over a range worth calling a direction, in each metric's own unit. One
   * shared number cannot work: half a degree is a real shift, half a hectopascal is nothing.
   */
  private static final double TEMPERATURE_TREND_THRESHOLD = 0.5; // °C

  private static final double PRESSURE_TREND_THRESHOLD = 2.0; // hPa
  private static final double HUMIDITY_TREND_THRESHOLD = 3.0; // %

  /** No conversion: the metric is charted in the unit it is stored in. */
  private static final DoubleUnaryOperator AS_STORED = DoubleUnaryOperator.identity();

  private final ConfigurationCache configurationCache;

  /**
   * The cards for one metric over a range. Each builder contributes only the cards its metric can
   * answer — a card with no data behind it is omitted rather than shown empty.
   */
  public MetricSummary buildSummary(List<DayPeriodMetrics> data, Metric metric) {
    return switch (metric) {
      case TEMPERATURE -> new MetricSummary(metric, temperatureCards(data));
      case PRESSURE -> new MetricSummary(metric, pressureCards(data));
      case HUMIDITY -> new MetricSummary(metric, humidityCards(data));
      case SURFACE_WETNESS -> new MetricSummary(metric, surfaceWetnessCards(data));
      // No cards defined yet is an empty answer, not an error. The cards travel with the chart
      // data, so throwing here would take the whole range down for a metric that charts fine.
      default -> {
        log.debug("No summary cards defined for metric {}", metric);
        yield new MetricSummary(metric, List.of());
      }
    };
  }

  /**
   * Temperature reads the daytime rows. Its diurnal swing is the whole reason the day/night split
   * exists, and "warmest day" plainly means the warmest daytime — a full-day figure blends the
   * night back in and flattens exactly the difference the cards are meant to show.
   */
  private List<SummaryCard> temperatureCards(List<DayPeriodMetrics> data) {
    Metric metric = Metric.TEMPERATURE;
    return cards(
        extremeHigh(data, metric, DayPeriod.DAY, "Warmest day"),
        extremeLow(data, metric, DayPeriod.DAY, "Coldest day"),
        trend(data, metric, DayPeriod.DAY, "Daylight trend", TEMPERATURE_TREND_THRESHOLD));
  }

  /**
   * Pressure reads the whole day. It has no diurnal cycle worth splitting on, and a depression
   * bottoming out at 03:00 is still that day's low — restricting to daylight would simply miss it.
   */
  private List<SummaryCard> pressureCards(List<DayPeriodMetrics> data) {
    Metric metric = Metric.PRESSURE;
    return cards(
        extremeHigh(data, metric, DayPeriod.FULL, "Highest pressure"),
        extremeLow(data, metric, DayPeriod.FULL, "Lowest pressure"),
        trend(data, metric, DayPeriod.FULL, "Pressure trend", PRESSURE_TREND_THRESHOLD));
  }

  /**
   * Humidity reads the whole day too, but for the opposite reason to pressure: its cycle is strong
   * and inverted against temperature, so the daily maximum falls before dawn. Reading daylight rows
   * would quietly discard the most humid part of every day.
   */
  private List<SummaryCard> humidityCards(List<DayPeriodMetrics> data) {
    Metric metric = Metric.HUMIDITY;
    return cards(
        extremeHigh(data, metric, DayPeriod.FULL, "Most humid day"),
        extremeLow(data, metric, DayPeriod.FULL, "Driest day"),
        trend(data, metric, DayPeriod.FULL, "Humidity trend", HUMIDITY_TREND_THRESHOLD));
  }

  /**
   * Surface wetness reads the whole day for humidity's reason rather than pressure's: dew forms
   * after dark and burns off through the morning, so daylight rows would miss the wettest hours of
   * most nights.
   *
   * <p>It is the one metric stored on an <em>inverted</em> scale — {@code daily_weather_record}
   * holds the raw ADC count, and a higher count is a drier surface. So the selections swap: the
   * wettest day is the one with the smallest stored minimum, found by {@code extremeLow} but
   * reported as an {@link CardKind#EXTREME_HIGH} because converted it is the largest percentage on
   * screen. Passing the conversion in rather than converting the rows keeps the entities untouched
   * and the arithmetic in one expression.
   *
   * <p>The two extremes are the whole set: there is deliberately <strong>no trend card</strong>.
   * The other three metrics vary continuously, so a least-squares fit over their daily averages
   * describes something. Wetness is close to bimodal and event-driven — dry for days, then soaked
   * for an afternoon — so a fitted slope over it mostly reports how many wet days happened to fall
   * near the end of the range, dressed up as a direction.
   */
  private List<SummaryCard> surfaceWetnessCards(List<DayPeriodMetrics> data) {
    Metric metric = Metric.SURFACE_WETNESS;
    var validation = configurationCache.getValidationConfig();
    DoubleUnaryOperator toPercentage =
        raw ->
            MeteoMath.rawToWetnessPct(
                raw,
                validation.surfaceWetnessDryBaseline(),
                validation.surfaceWetnessWetBaseline());

    return cards(
        extremeLow(
            data, metric, DayPeriod.FULL, "Wettest day", CardKind.EXTREME_HIGH, toPercentage),
        extremeHigh(
            data, metric, DayPeriod.FULL, "Driest day", CardKind.EXTREME_LOW, toPercentage));
  }

  /** Collects the cards a metric produced, dropping the ones with no data behind them. */
  private static List<SummaryCard> cards(SummaryCard... candidates) {
    List<SummaryCard> present = new ArrayList<>(candidates.length);
    for (SummaryCard card : candidates) {
      if (card != null) {
        present.add(card);
      }
    }
    return List.copyOf(present);
  }

  private SummaryCard extremeHigh(
      List<DayPeriodMetrics> data, Metric metric, DayPeriod period, String label) {
    return extremeHigh(data, metric, period, label, CardKind.EXTREME_HIGH, AS_STORED);
  }

  /**
   * The row holding the largest stored maximum. {@code kind} and {@code display} are separate from
   * the selection because a metric stored on an inverted scale finds its highest <em>displayed</em>
   * value here — see {@link #surfaceWetnessCards}.
   */
  private SummaryCard extremeHigh(
      List<DayPeriodMetrics> data,
      Metric metric,
      DayPeriod period,
      String label,
      CardKind kind,
      DoubleUnaryOperator display) {
    Optional<DayPeriodMetrics> highest =
        rowsOf(data, period)
            .filter(day -> day.getMaxByMetric(metric) != null)
            .max(Comparator.comparing(day -> day.getMaxByMetric(metric)));

    return highest
        .map(
            day ->
                SummaryCard.onDate(
                    kind, label, display.applyAsDouble(day.getMaxByMetric(metric)), day.getDate()))
        .orElse(null);
  }

  private SummaryCard extremeLow(
      List<DayPeriodMetrics> data, Metric metric, DayPeriod period, String label) {
    return extremeLow(data, metric, period, label, CardKind.EXTREME_LOW, AS_STORED);
  }

  /** The row holding the smallest stored minimum; {@code kind} and {@code display} as above. */
  private SummaryCard extremeLow(
      List<DayPeriodMetrics> data,
      Metric metric,
      DayPeriod period,
      String label,
      CardKind kind,
      DoubleUnaryOperator display) {
    Optional<DayPeriodMetrics> lowest =
        rowsOf(data, period)
            .filter(day -> day.getMinByMetric(metric) != null)
            .min(Comparator.comparing(day -> day.getMinByMetric(metric)));

    return lowest
        .map(
            day ->
                SummaryCard.onDate(
                    kind, label, display.applyAsDouble(day.getMinByMetric(metric)), day.getDate()))
        .orElse(null);
  }

  /**
   * Total change across the range, from a least-squares fit over the daily averages.
   *
   * <p>The card is labelled with its two end dates, so it has to report change across that whole
   * span — not the per-day rate {@code calculateTrend} returns. The fit is used rather than
   * last-minus-first so one unusual endpoint cannot flip the sign of the only directional number on
   * screen.
   */
  private SummaryCard trend(
      List<DayPeriodMetrics> data,
      Metric metric,
      DayPeriod period,
      String label,
      double threshold) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();

    List<DayPeriodMetrics> rows =
        rowsOf(data, period)
            .filter(day -> day.getAvgByMetric(metric) != null)
            .sorted(Comparator.comparing(DayPeriodMetrics::getDate))
            .toList();

    // A slope needs at least two points, and a span needs them on different days.
    if (rows.size() < 2) {
      return null;
    }

    List<DataPoint> points =
        rows.stream()
            .map(
                day ->
                    new DataPoint(
                        day.getDate().atStartOfDay(zoneId).toInstant(), day.getAvgByMetric(metric)))
            .toList();

    LocalDate from = rows.getFirst().getDate();
    LocalDate to = rows.getLast().getDate();

    TrendResult result = MeteoMath.calculateTotalChange(points, threshold);

    return SummaryCard.overRange(CardKind.TREND, label, result.changeValue(), from, to);
  }

  private static Stream<DayPeriodMetrics> rowsOf(List<DayPeriodMetrics> data, DayPeriod period) {
    return data.stream().filter(day -> day.getPeriod() == period);
  }
}
