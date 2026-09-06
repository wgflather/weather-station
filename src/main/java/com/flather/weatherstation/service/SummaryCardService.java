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
import com.flather.weatherstation.dto.projection.HourOfDayAverage;
import com.flather.weatherstation.repository.HourlyWeatherRecordRepository;
import com.flather.weatherstation.util.MeteoMath;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.DoubleUnaryOperator;
import java.util.function.Function;
import java.util.stream.Stream;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * Builds the stat cards above the history chart from a range of daily rollup rows.
 *
 * <p>Which period a metric reads is a per-metric decision, not a default: temperature reads the
 * daytime rows because that is what "warmest day" means, while pressure reads the whole day because
 * its extremes fall outside daylight — a depression bottoming out at 03:00. Each builder states its
 * own reasoning.
 *
 * <p>So is the <em>shape</em> of the answer. Most cards name a date, and those are built from the
 * daily rows the caller already loaded. Humidity's extremes name an hour of the day instead, which
 * the daily rows cannot answer at any period, so that builder — alone — goes back to the hourly
 * table. The fetch lives in the builder rather than in the caller so that the choice stays beside
 * the reasoning for it, and so the other metrics' tabs make no extra query.
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

  private final ConfigurationCache configurationCache;
  private final HourlyWeatherRecordRepository hourlyWeatherRecordRepository;

  /**
   * The cards for one metric over a range. Each builder contributes only the cards its metric can
   * answer — a card with no data behind it is omitted rather than shown empty.
   *
   * <p>{@code from} and {@code to} bound the same range {@code data} was read over, both inclusive.
   * They are passed rather than derived from the rows because a builder may need to go back to the
   * database for a different shape of the same range, and the rows only cover the dates that
   * happened to have data.
   */
  public MetricSummary buildSummary(
      List<DayPeriodMetrics> data, Metric metric, LocalDate from, LocalDate to) {
    return switch (metric) {
      case TEMPERATURE -> new MetricSummary(metric, temperatureCards(data));
      case PRESSURE -> new MetricSummary(metric, pressureCards(data));
      case HUMIDITY -> new MetricSummary(metric, humidityCards(data, from, to));
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
   * Temperature takes one card from each side of the split — the warmest daytime and the coldest
   * night — because that is the pair of questions the day/night rows exist to answer. Both cards
   * reading {@code DAY} wasted half of it, and a daytime <em>low</em> is a quantity nobody asks
   * for: the cold part of a date happens before dawn, which lives in that date's {@code NIGHT} row.
   *
   * <p>Both rank on the period <em>average</em>, not on a single reading. "Warmest day" is a claim
   * about a day, so it has to be answered by something that describes one; the highest sample is a
   * property of a moment, is set by whichever minute the sun was on the enclosure, and cannot be
   * compared between days.
   *
   * <p>Note the night for date D runs from D-1's sunset to D's sunrise, so the date on a "Coldest
   * night" card is the morning the night ended on.
   */
  private List<SummaryCard> temperatureCards(List<DayPeriodMetrics> data) {
    Metric metric = Metric.TEMPERATURE;
    return cards(
        extremeHigh(data, DayPeriod.DAY, "Warmest day", day -> day.getAvgByMetric(metric)),
        extremeLow(data, DayPeriod.NIGHT, "Coldest night", day -> day.getAvgByMetric(metric)),
        trend(data, metric, DayPeriod.DAY, "Daylight trend", TEMPERATURE_TREND_THRESHOLD));
  }

  /**
   * Pressure reads the whole day. It has no diurnal cycle worth splitting on, and a depression
   * bottoming out at 03:00 is still that day's low — restricting to daylight would simply miss it.
   */
  private List<SummaryCard> pressureCards(List<DayPeriodMetrics> data) {
    Metric metric = Metric.PRESSURE;
    return cards(
        extremeHigh(data, DayPeriod.FULL, "Highest pressure", day -> day.getMaxByMetric(metric)),
        extremeLow(data, DayPeriod.FULL, "Lowest pressure", day -> day.getMinByMetric(metric)),
        trend(data, metric, DayPeriod.FULL, "Pressure trend", PRESSURE_TREND_THRESHOLD));
  }

  /**
   * Humidity is the one metric whose extremes are answered by an <em>hour of the day</em> rather
   * than by a date. Its cycle is strong, inverted against temperature and repeats nightly, so
   * "which day was most humid" mostly reports which airmass happened to sit over the station, while
   * "which hours are reliably the most humid" describes the site itself — a fact the daily chart
   * beside these cards cannot show, because it carries one point per day.
   *
   * <p>The two cards rank three-hour windows rather than single hours: relative humidity pins near
   * 100 % through the small hours, so a single-hour pick decides a near-tie and moves between
   * neighbouring hours on reload. See {@link #WINDOW_HOURS}.
   *
   * <p>One query serves both cards. The scan over 24 buckets is repeated per card, which is free;
   * the round trip is not, and this is the only builder that makes one.
   */
  private List<SummaryCard> humidityCards(
      List<DayPeriodMetrics> data, LocalDate from, LocalDate to) {
    Metric metric = Metric.HUMIDITY;
    Double[] byHourOfDay = humidityByHourOfDay(from, to);

    return cards(
        extremeWindow(byHourOfDay, CardKind.EXTREME_HIGH, "Most humid stretch"),
        extremeWindow(byHourOfDay, CardKind.EXTREME_LOW, "Driest stretch"),
        trend(data, metric, DayPeriod.FULL, "Humidity trend", HUMIDITY_TREND_THRESHOLD));
  }

  /**
   * Mean humidity for each hour of the day across the range, indexed 0–23, with null for any hour
   * that cannot be ranked — never observed, or observed on too few of the range's days.
   *
   * <p>Both bounds are inclusive dates, so the window runs to the start of the day <em>after</em>
   * {@code to}. Stopping at {@code to} itself would drop the newest day of every range — the one
   * the reader most likely came for — while the chart beside the cards still charted it.
   */
  private Double[] humidityByHourOfDay(LocalDate from, LocalDate to) {
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
   * the comparison the coverage floor exists to prevent. If no window survives, the card is omitted
   * — {@link #cards} drops it, the same as any other card with nothing behind it.
   */
  private static SummaryCard extremeWindow(Double[] byHourOfDay, CardKind kind, String label) {
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
            data,
            DayPeriod.FULL,
            "Wettest day",
            CardKind.EXTREME_HIGH,
            day -> day.getMinByMetric(metric),
            toPercentage),
        extremeHigh(
            data,
            DayPeriod.FULL,
            "Driest day",
            CardKind.EXTREME_LOW,
            day -> day.getMaxByMetric(metric),
            toPercentage));
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
      List<DayPeriodMetrics> data,
      DayPeriod period,
      String label,
      Function<DayPeriodMetrics, Double> valueGetter) {
    return extremeHigh(data, period, label, CardKind.EXTREME_HIGH, valueGetter, AS_STORED);
  }

  /**
   * The row holding the largest stored maximum. {@code kind} and {@code display} are separate from
   * the selection because a metric stored on an inverted scale finds its highest <em>displayed</em>
   * value here — see {@link #surfaceWetnessCards}.
   */
  private SummaryCard extremeHigh(
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

  private SummaryCard extremeLow(
      List<DayPeriodMetrics> data,
      DayPeriod period,
      String label,
      Function<DayPeriodMetrics, Double> valueGetter) {
    return extremeLow(data, period, label, CardKind.EXTREME_LOW, valueGetter, AS_STORED);
  }

  /** The row holding the smallest stored minimum; {@code kind} and {@code display} as above. */
  private SummaryCard extremeLow(
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
