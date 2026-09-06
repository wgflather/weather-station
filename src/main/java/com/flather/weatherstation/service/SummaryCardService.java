package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.domain.constant.CardKind;
import com.flather.weatherstation.domain.constant.DayPeriod;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.DayPeriodMetrics;
import com.flather.weatherstation.dto.analytics.MetricSummary;
import com.flather.weatherstation.dto.analytics.SummaryCard;
import com.flather.weatherstation.util.MeteoMath;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.function.DoubleUnaryOperator;
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
 * the daily rows cannot answer at any period, so that builder — alone — reaches the hourly table,
 * through {@link SummaryAnalytics}. The other metrics' tabs make no extra query.
 *
 * <p>This class holds only those per-metric decisions. Everything about <em>how</em> a winner is
 * found — ranking rows, scanning diurnal windows, fitting a trend — lives in {@link
 * SummaryAnalytics}, so a builder here reads as a list of the questions its metric answers. The one
 * piece of arithmetic left is surface wetness's ADC-to-percentage conversion, which stays because
 * it is a property of that metric rather than of any selection rule.
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

  private final ConfigurationCache configurationCache;
  private final SummaryAnalytics analytics;

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
      case HUMIDITY -> new MetricSummary(metric, humidityCards(from, to));
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
        analytics.extremeHigh(
            data, DayPeriod.DAY, "Warmest day", day -> day.getAvgByMetric(metric)),
        analytics.extremeLow(
            data, DayPeriod.NIGHT, "Coldest night", day -> day.getAvgByMetric(metric)),
        analytics.trend(
            data, metric, DayPeriod.DAY, "Daylight trend", TEMPERATURE_TREND_THRESHOLD));
  }

  /**
   * Pressure reads the whole day. It has no diurnal cycle worth splitting on, and a depression
   * bottoming out at 03:00 is still that day's low — restricting to daylight would simply miss it.
   */
  private List<SummaryCard> pressureCards(List<DayPeriodMetrics> data) {
    Metric metric = Metric.PRESSURE;
    return cards(
        analytics.extremeHigh(
            data, DayPeriod.FULL, "Highest pressure", day -> day.getMaxByMetric(metric)),
        analytics.extremeLow(
            data, DayPeriod.FULL, "Lowest pressure", day -> day.getMinByMetric(metric)),
        analytics.trend(data, metric, DayPeriod.FULL, "Pressure trend", PRESSURE_TREND_THRESHOLD));
  }

  /**
   * Humidity is the one metric whose extremes are answered by an <em>hour of the day</em> rather
   * than by a date. Its cycle is strong, inverted against temperature and repeats nightly, so
   * "which day was most humid" mostly reports which airmass happened to sit over the station, while
   * "which hours are reliably the most humid" describes the site itself — a fact the daily chart
   * beside these cards cannot show, because it carries one point per day.
   *
   * <p>The two stretch cards rank three-hour windows rather than single hours: relative humidity
   * pins near 100 % through the small hours, so a single-hour pick decides a near-tie and moves
   * between neighbouring hours on reload. See {@code SummaryAnalytics.WINDOW_HOURS}.
   *
   * <p>The third card leaves relative humidity behind entirely. RH is confounded by temperature —
   * 90 % at 2 °C is dry air, 90 % at 20 °C is a great deal of water — so it cannot answer whether
   * anything actually got wet. The temperature-to-dew-point spread can, and its smallest value over
   * the range is the moment the station came nearest to condensation.
   *
   * <p>This builder makes <strong>two</strong> queries and is the only one that queries at all: one
   * for the diurnal buckets, one for the closest approach to dew. The 24-bucket scan is repeated
   * per stretch card, which is free; the round trips are not, which is why the two stretch cards
   * share their fetch rather than each making their own.
   */
  private List<SummaryCard> humidityCards(LocalDate from, LocalDate to) {
    Double[] byHourOfDay = analytics.humidityByHourOfDay(from, to);

    return cards(
        analytics.extremeWindow(byHourOfDay, CardKind.EXTREME_HIGH, "Most humid stretch"),
        analytics.extremeWindow(byHourOfDay, CardKind.EXTREME_LOW, "Driest stretch"),
        analytics.closestToDewPoint(from, to));
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
        analytics.extremeLow(
            data,
            DayPeriod.FULL,
            "Wettest day",
            CardKind.EXTREME_HIGH,
            day -> day.getMinByMetric(metric),
            toPercentage),
        analytics.extremeHigh(
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
}
