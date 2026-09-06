package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.domain.constant.CardKind;
import com.flather.weatherstation.domain.constant.DayPeriod;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.DayPeriodMetrics;
import com.flather.weatherstation.dto.analytics.SummaryCard;
import com.flather.weatherstation.dto.analytics.TrendResult;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.dto.projection.HourOfDayAverage;
import com.flather.weatherstation.repository.HourlyWeatherRecordRepository;
import com.flather.weatherstation.util.MeteoMath;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.DoubleUnaryOperator;
import java.util.function.Function;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * How a summary card's number is found — the selection and aggregation behind every card, with no
 * opinion about which card any metric should have.
 *
 * <p>That split is the point. {@link SummaryCardService} answers "what question does this metric
 * deserve" and this class answers "given that question, which row or which hour wins", so a new
 * card is usually a line in the builder rather than new arithmetic here. The primitives are
 * deliberately metric-blind: {@code extremeHigh} takes an accessor rather than a {@code Metric},
 * which is what lets surface wetness rank on the smallest stored count and still report an {@code
 * EXTREME_HIGH}.
 *
 * <p>It is also where the database lives. Most cards are built from daily rows the caller already
 * loaded and need nothing further, but humidity's cards cannot be answered from those rows at any
 * period, so the two hourly queries sit here. Only the humidity tab pays for them.
 */
@Service
@RequiredArgsConstructor
public class SummaryAnalytics {
  private final ConfigurationCache configurationCache;
  private final HourlyWeatherRecordRepository hourlyWeatherRecordRepository;

  private static final int HOURS_PER_DAY = 24;

  /**
   * Width of a diurnal card's window, in hours.
   *
   * <p>Fixed rather than chosen per range, and deliberately not a "best of 2 or 3": a narrower
   * window can always drop its worst hour and so scores more extreme in <em>both</em> directions,
   * which means letting the width vary would simply return the narrowest one every time. Three is
   * wide enough that the winning window shifts smoothly — neighbouring windows differ by swapping
   * one hour in and one out — where a single-hour pick flips between near-tied hours on the
   * overnight plateau.
   */
  private static final int WINDOW_HOURS = 3;

  /**
   * Fraction of the range's days an hour must have been observed on before it can be ranked. Guards
   * the case where an outage leaves one hour with a couple of readings, which would otherwise
   * compete on equal footing with an hour seen on every day of the range.
   */
  private static final double MIN_HOUR_COVERAGE = 0.7;

  /** No conversion: the metric is charted in the unit it is stored in. */
  private static final DoubleUnaryOperator AS_STORED = DoubleUnaryOperator.identity();

  /**
   * Mean humidity for each hour of the day across the range, indexed 0–23, with null for any hour
   * that cannot be ranked — never observed, or observed on too few of the range's days.
   *
   * <p>Both bounds are inclusive dates, so the window runs to the start of the day <em>after</em>
   * {@code to}. Stopping at {@code to} itself would drop the newest day of every range — the one
   * the reader most likely came for — while the chart beside the cards still charted it.
   */
  public Double[] humidityByHourOfDay(LocalDate from, LocalDate to) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();

    List<HourOfDayAverage> rows =
        hourlyWeatherRecordRepository.findHumidityByHourOfDay(
            zoneId.getId(),
            from.atStartOfDay(zoneId).toInstant(),
            to.plusDays(1).atStartOfDay(zoneId).toInstant());

    long rangeDays = ChronoUnit.DAYS.between(from, to) + 1;
    long minSamples = Math.max(1, (long) Math.ceil(rangeDays * MIN_HOUR_COVERAGE));

    Double[] means = new Double[HOURS_PER_DAY];
    for (HourOfDayAverage row : rows) {
      if (row.hourOfDay() == null || row.value() == null) {
        continue;
      }
      if (row.samples() == null || row.samples() < minSamples) {
        continue;
      }
      means[row.hourOfDay()] = row.value();
    }
    return means;
  }

  /**
   * The {@link #WINDOW_HOURS}-hour stretch of the day with the highest or lowest mean.
   *
   * <p>The scan wraps past midnight: the most humid stretch of a clear night can genuinely run
   * 23:00 → 02:00, and a scan that stopped at hour 23 would report the second-best answer without
   * saying so.
   *
   * <p>A window containing an unrankable hour is skipped whole rather than averaged around. With a
   * hole in it the mean would be over two hours where every rival is over three, which is exactly
   * the comparison the coverage floor exists to prevent. If no window survives this returns null
   * and {@link SummaryCardService} drops the card, the same as any other with nothing behind it.
   */
  public SummaryCard extremeWindow(Double[] byHourOfDay, CardKind kind, String label) {
    Double best = null;
    int bestStart = -1;

    for (int start = 0; start < HOURS_PER_DAY; start++) {
      Double mean = windowMean(byHourOfDay, start);
      if (mean == null) {
        continue;
      }
      boolean better = best == null || (kind == CardKind.EXTREME_HIGH ? mean > best : mean < best);
      if (better) {
        best = mean;
        bestStart = start;
      }
    }

    if (best == null) {
      return null;
    }

    return SummaryCard.overWindow(
        kind,
        label,
        best,
        LocalTime.of(bestStart, 0),
        LocalTime.of((bestStart + WINDOW_HOURS) % HOURS_PER_DAY, 0));
  }

  /** The mean of the window opening at {@code start}, or null if any of its hours is unrankable. */
  private static Double windowMean(Double[] byHourOfDay, int start) {
    double sum = 0;
    for (int offset = 0; offset < WINDOW_HOURS; offset++) {
      Double value = byHourOfDay[(start + offset) % HOURS_PER_DAY];
      if (value == null) {
        return null;
      }
      sum += value;
    }
    return sum / WINDOW_HOURS;
  }

  /**
   * The moment in the range that came nearest to condensation: the smallest gap between temperature
   * and dew point, with the hour it happened.
   *
   * <p>An {@code EXTREME_LOW}, because that is what the number is — the smallest of something. The
   * card's question lives in its label, not in a {@code CardKind} of its own; a kind per question
   * would grow one entry per card and tell the frontend nothing it can style on.
   *
   * <p>It carries the hour as well as the date, and the hour is half the answer: a 1.5 °C spread at
   * 03:00 is an ordinary clear night, the same spread at 14:00 is fog. Both come from resolving the
   * returned instant in the station's zone, so the pair always agree — reading the date from one
   * source and the hour from another is how a card ends up naming an evening it did not measure.
   *
   * <p>The value is in <strong>°C, not the humidity tab's percent</strong>, so the card names
   * temperature as its unit metric. Without that the frontend would append the tab's unit and print
   * a temperature spread as "1.7 %".
   *
   * <p>The range bound matches {@link #humidityByHourOfDay}: {@code to} is an inclusive date, so
   * the query runs to the start of the day after it.
   */
  public SummaryCard closestToDewPoint(LocalDate from, LocalDate to) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();

    DataPoint smallestGap =
        hourlyWeatherRecordRepository.findLowestDewPointGap(
            from.atStartOfDay(zoneId).toInstant(),
            to.plusDays(1).atStartOfDay(zoneId).toInstant(),
            MeteoMath.DEW_POINT_A,
            MeteoMath.DEW_POINT_B);

    // No hour in the range had both a temperature and a humidity; the card is omitted like any
    // other with nothing behind it.
    if (smallestGap == null || smallestGap.value() == null) {
      return null;
    }

    ZonedDateTime measuredAt = smallestGap.hour().atZone(zoneId);

    return SummaryCard.onDateAndHour(
        CardKind.EXTREME_LOW,
        "Closest to dew point",
        smallestGap.value(),
        Metric.TEMPERATURE.getRequestKey(),
        measuredAt.toLocalDate(),
        measuredAt.toLocalTime());
  }

  public SummaryCard extremeHigh(
      List<DayPeriodMetrics> data,
      DayPeriod period,
      String label,
      Function<DayPeriodMetrics, Double> valueGetter) {
    return extremeHigh(data, period, label, CardKind.EXTREME_HIGH, valueGetter, AS_STORED);
  }

  /**
   * The row holding the largest stored maximum. {@code kind} and {@code display} are separate from
   * the selection because a metric stored on an inverted scale finds its highest <em>displayed</em>
   * value here — see the surface wetness builder in {@link SummaryCardService}, whose "wettest day"
   * is the smallest stored count reported as an {@link CardKind#EXTREME_HIGH}.
   */
  public SummaryCard extremeHigh(
      List<DayPeriodMetrics> data,
      DayPeriod period,
      String label,
      CardKind kind,
      Function<DayPeriodMetrics, Double> valueGetter,
      DoubleUnaryOperator display) {
    Optional<DayPeriodMetrics> highest =
        rowsOf(data, period)
            .filter(day -> valueGetter.apply(day) != null)
            .max(Comparator.comparing(valueGetter));

    return highest
        .map(
            day ->
                SummaryCard.onDate(
                    kind, label, display.applyAsDouble(valueGetter.apply(day)), day.getDate()))
        .orElse(null);
  }

  public SummaryCard extremeLow(
      List<DayPeriodMetrics> data,
      DayPeriod period,
      String label,
      Function<DayPeriodMetrics, Double> valueGetter) {
    return extremeLow(data, period, label, CardKind.EXTREME_LOW, valueGetter, AS_STORED);
  }

  /** The row holding the smallest stored minimum; {@code kind} and {@code display} as above. */
  public SummaryCard extremeLow(
      List<DayPeriodMetrics> data,
      DayPeriod period,
      String label,
      CardKind kind,
      Function<DayPeriodMetrics, Double> valueGetter,
      DoubleUnaryOperator display) {
    Optional<DayPeriodMetrics> lowest =
        rowsOf(data, period)
            .filter(day -> valueGetter.apply(day) != null)
            .min(Comparator.comparing(valueGetter));

    return lowest
        .map(
            day ->
                SummaryCard.onDate(
                    kind, label, display.applyAsDouble(valueGetter.apply(day)), day.getDate()))
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
  public SummaryCard trend(
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
