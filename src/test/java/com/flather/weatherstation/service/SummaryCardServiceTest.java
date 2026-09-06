package com.flather.weatherstation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.offset;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.config.LocationContext;
import com.flather.weatherstation.config.WeatherValidationConfig;
import com.flather.weatherstation.domain.constant.CardKind;
import com.flather.weatherstation.domain.constant.DayPeriod;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.DayPeriodMetrics;
import com.flather.weatherstation.dto.analytics.MetricSummary;
import com.flather.weatherstation.dto.analytics.SummaryCard;
import com.flather.weatherstation.dto.projection.HourOfDayAverage;
import com.flather.weatherstation.repository.HourlyWeatherRecordRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class SummaryCardServiceTest {

  private static final ZoneId UTC = ZoneId.of("UTC");
  private static final LocalDate START = LocalDate.of(2026, 8, 28);

  /** Inclusive end of the range the helpers below build summaries over — seven days in all. */
  private static final LocalDate END = START.plusDays(6);

  /** Days an hour must appear on to be rankable over that seven-day range: ceil(7 × 0.7). */
  private static final long ENOUGH_SAMPLES = 5;

  @Mock ConfigurationCache configurationCache;
  @Mock HourlyWeatherRecordRepository hourlyWeatherRecordRepository;
  @InjectMocks SummaryCardService service;

  @BeforeEach
  void setup() {
    given(configurationCache.getLocationContext())
        .willReturn(new LocationContext(52.5, 13.4, 34.0, UTC, null));
    // 150 / 3230 are the station's own wetness baselines, so the expected percentages are real.
    given(configurationCache.getValidationConfig())
        .willReturn(
            new WeatherValidationConfig(
                -50, 60, 900, 1100, 0, 100, 20, 5.0, 10.0, 150, 3230, 0.0, 60.0, 15.0, 0.0, 15.0,
                5.0));
  }

  /** The cards for a metric over the fixed {@link #START}–{@link #END} range. */
  private MetricSummary summaryOf(List<DayPeriodMetrics> data, Metric metric) {
    return service.buildSummary(data, metric, START, END);
  }

  /**
   * Stubs the diurnal query with one bucket per hour, {@code values[h]} at hour h, every hour
   * observed on enough days to be rankable. A null entry leaves that hour out of the result
   * entirely, standing for an hour the station never recorded.
   */
  private void givenHumidityByHourOfDay(Double[] values) {
    List<HourOfDayAverage> rows = new ArrayList<>();
    for (int hour = 0; hour < 24; hour++) {
      if (values[hour] != null) {
        rows.add(new HourOfDayAverage(hour, values[hour], ENOUGH_SAMPLES));
      }
    }
    given(hourlyWeatherRecordRepository.findHumidityByHourOfDay(any(), any(), any()))
        .willReturn(rows);
  }

  /** 24 hours all sitting at {@code value}, for fixtures that then dent a few of them. */
  private static Double[] flatHours(double value) {
    Double[] hours = new Double[24];
    Arrays.fill(hours, value);
    return hours;
  }

  private static DayPeriodMetrics day(LocalDate date, DayPeriod period, double min, double max) {
    DayPeriodMetrics row = new DayPeriodMetrics();
    row.setDate(date);
    row.setPeriod(period);
    row.setTemperatureMin(min);
    row.setTemperatureMax(max);
    row.setTemperatureAvg((min + max) / 2);
    return row;
  }

  private static SummaryCard cardOfKind(MetricSummary summary, CardKind kind) {
    return summary.cards().stream().filter(c -> c.kind() == kind).findFirst().orElse(null);
  }

  /**
   * The coldest night is the one that was coldest <em>on average</em>, not the one that touched the
   * lowest reading. The fixture separates the two: the night with the lowest minimum is the mildest
   * of the three overall, so a minimum-ranked card would pick it and a mean-ranked one will not.
   */
  @Test
  void coldestNight_ranksNightsByAverage_notByTheLowestReading() {
    List<DayPeriodMetrics> data =
        List.of(
            day(START, DayPeriod.NIGHT, 2.0, 14.0), //          avg  8.0
            day(
                START.plusDays(1),
                DayPeriod.NIGHT,
                0.0,
                20.0), // avg 10.0 — lowest reading, mildest night
            day(
                START.plusDays(2),
                DayPeriod.NIGHT,
                5.0,
                7.0)); // avg  6.0 — genuinely the coldest night

    SummaryCard low = cardOfKind(summaryOf(data, Metric.TEMPERATURE), CardKind.EXTREME_LOW);

    assertThat(low).isNotNull();
    assertThat(low.label()).isEqualTo("Coldest night");
    assertThat(low.value()).isEqualTo(6.0);
    assertThat(low.date()).isEqualTo(START.plusDays(2));
  }

  /**
   * The two temperature cards come from opposite sides of the split, and each ranks on its mean.
   */
  @Test
  void temperatureCards_takeTheWarmestDayAndTheColdestNight() {
    List<DayPeriodMetrics> data =
        List.of(
            day(START, DayPeriod.DAY, 12.0, 25.0), //             avg 18.5 — warmest daytime
            day(START.plusDays(1), DayPeriod.DAY, 4.0, 31.0), //  avg 17.5, but the highest peak
            day(START, DayPeriod.NIGHT, 2.0, 10.0), //            avg  6.0
            day(START.plusDays(1), DayPeriod.NIGHT, 0.0, 8.0)); // avg  4.0 — coldest night

    MetricSummary summary = summaryOf(data, Metric.TEMPERATURE);
    SummaryCard high = cardOfKind(summary, CardKind.EXTREME_HIGH);
    SummaryCard low = cardOfKind(summary, CardKind.EXTREME_LOW);

    // 31.0 is the highest reading in the range; ranking on peaks would report it and the wrong day.
    assertThat(high.label()).isEqualTo("Warmest day");
    assertThat(high.value()).isEqualTo(18.5);
    assertThat(high.date()).isEqualTo(START);

    assertThat(low.label()).isEqualTo("Coldest night");
    assertThat(low.value()).isEqualTo(4.0);
    assertThat(low.date()).isEqualTo(START.plusDays(1));
  }

  /**
   * Dates rolled up before the day/night split have a FULL row alone, so a range covering them can
   * offer a warmest day with no coldest night beside it.
   */
  @Test
  void coldestNight_isOmittedWhenTheRangeHasNoNightRows() {
    MetricSummary summary =
        summaryOf(List.of(day(START, DayPeriod.DAY, 12.0, 25.0)), Metric.TEMPERATURE);

    assertThat(cardOfKind(summary, CardKind.EXTREME_HIGH)).isNotNull();
    assertThat(cardOfKind(summary, CardKind.EXTREME_LOW)).isNull();
  }

  @Test
  void trend_reportsTotalChangeAcrossTheRange_notThePerDayRate() {
    // Six days rising 2 °C/day: +10 °C across the five-day span the card is labelled with.
    List<DayPeriodMetrics> data = new ArrayList<>();
    for (int i = 0; i < 6; i++) {
      data.add(day(START.plusDays(i), DayPeriod.DAY, 10.0 + 2 * i, 10.0 + 2 * i));
    }

    SummaryCard trend = cardOfKind(summaryOf(data, Metric.TEMPERATURE), CardKind.TREND);

    assertThat(trend.value()).isEqualTo(10.0);
    assertThat(trend.rangeStart()).isEqualTo(START);
    assertThat(trend.rangeEnd()).isEqualTo(START.plusDays(5));
    assertThat(trend.date()).isNull();
  }

  @Test
  void trend_survivesASlopeBelowThePerDayThreshold() {
    // 0.2 °C/day is under the per-day trend threshold, but across 30 days it is +6 °C —
    // scaling a thresholded rate would have reported this as no change at all.
    List<DayPeriodMetrics> data = new ArrayList<>();
    for (int i = 0; i <= 30; i++) {
      data.add(day(START.plusDays(i), DayPeriod.DAY, 10.0 + 0.2 * i, 10.0 + 0.2 * i));
    }

    SummaryCard trend = cardOfKind(summaryOf(data, Metric.TEMPERATURE), CardKind.TREND);

    assertThat(trend.value()).isEqualTo(6.0);
  }

  /**
   * FULL rows are ignored by both cards. The fixture makes them tempting on purpose — the FULL rows
   * hold the highest and the lowest averages in the range — so either card reading them would be
   * visible here rather than only on real data.
   */
  @Test
  void temperatureCards_ignoreFullDayRows() {
    List<DayPeriodMetrics> data =
        List.of(
            day(START, DayPeriod.DAY, 12.0, 25.0), //                 avg 18.5 — expected high
            day(START, DayPeriod.NIGHT, -5.0, 8.0), //                avg  1.5
            day(START, DayPeriod.FULL, 35.0, 45.0), //                avg 40.0 — would win the high
            day(START.plusDays(1), DayPeriod.DAY, 9.0, 27.0), //      avg 18.0
            day(START.plusDays(1), DayPeriod.NIGHT, -8.0, 6.0), //    avg -1.0 — expected low
            day(START.plusDays(1), DayPeriod.FULL, -30.0, -20.0)); // avg -25.0 — would win the low

    MetricSummary summary = summaryOf(data, Metric.TEMPERATURE);

    assertThat(cardOfKind(summary, CardKind.EXTREME_HIGH).value()).isEqualTo(18.5);
    assertThat(cardOfKind(summary, CardKind.EXTREME_LOW).value()).isEqualTo(-1.0);
  }

  // ---- pressure ----

  @Test
  void pressureCards_readTheWholeDay_soANightLowStillCounts() {
    DayPeriodMetrics full = new DayPeriodMetrics();
    full.setDate(START);
    full.setPeriod(DayPeriod.FULL);
    full.setPressureMin(981.0); // bottomed out overnight
    full.setPressureMax(1016.0);
    full.setPressureAvg(1000.0);

    DayPeriodMetrics daytime = new DayPeriodMetrics();
    daytime.setDate(START);
    daytime.setPeriod(DayPeriod.DAY);
    daytime.setPressureMin(1004.0);
    daytime.setPressureMax(1016.0);
    daytime.setPressureAvg(1010.0);

    MetricSummary summary = summaryOf(List.of(full, daytime), Metric.PRESSURE);

    // Reading daylight rows would report 1004 and miss the depression entirely.
    assertThat(cardOfKind(summary, CardKind.EXTREME_LOW).value()).isEqualTo(981.0);
    assertThat(cardOfKind(summary, CardKind.EXTREME_HIGH).value()).isEqualTo(1016.0);
  }

  @Test
  void pressureTrend_ignoresDriftSmallerThanAHectopascalOrTwo() {
    // 0.1 hPa/day is noise for pressure, though the same number would be a real move in °C.
    List<DayPeriodMetrics> data = new ArrayList<>();
    for (int i = 0; i <= 6; i++) {
      DayPeriodMetrics row = new DayPeriodMetrics();
      row.setDate(START.plusDays(i));
      row.setPeriod(DayPeriod.FULL);
      row.setPressureAvg(1013.0 + 0.1 * i);
      data.add(row);
    }

    assertThat(cardOfKind(summaryOf(data, Metric.PRESSURE), CardKind.TREND).value()).isEqualTo(0.0);
  }

  // ---- humidity ----

  private static DayPeriodMetrics humidityRow(
      LocalDate date, DayPeriod period, double min, double max, double avg) {
    DayPeriodMetrics row = new DayPeriodMetrics();
    row.setDate(date);
    row.setPeriod(period);
    row.setHumidityMin(min);
    row.setHumidityMax(max);
    row.setHumidityAvg(avg);
    return row;
  }

  /**
   * The two extremes moved to hours of the day, but the trend still reads the daily FULL rows and
   * still describes the range as a span of dates. It is the one humidity card the diurnal pair did
   * not replace.
   */
  @Test
  void humidityTrend_stillReadsTheDailyFullRows() {
    List<DayPeriodMetrics> data =
        List.of(
            humidityRow(START, DayPeriod.FULL, 38.0, 97.0, 60.0),
            humidityRow(START.plusDays(1), DayPeriod.FULL, 45.0, 98.0, 70.0),
            humidityRow(START.plusDays(2), DayPeriod.FULL, 55.0, 99.0, 80.0));

    SummaryCard trend = cardOfKind(summaryOf(data, Metric.HUMIDITY), CardKind.TREND);

    assertThat(trend.value()).isEqualTo(20.0);
    assertThat(trend.rangeStart()).isEqualTo(START);
    assertThat(trend.rangeEnd()).isEqualTo(START.plusDays(2));
    assertThat(trend.windowStart()).isNull();
  }

  /**
   * Humidity's extremes name a time of day, not a date — the property that separates them from
   * every other metric's cards, and the one the frontend branches on to decide what to print
   * underneath the value.
   */
  @Test
  void humidityExtremes_nameAnHourOfDay_ratherThanADate() {
    Double[] hours = flatHours(60.0);
    hours[3] = 90.0;
    hours[4] = 90.0;
    hours[5] = 90.0;
    givenHumidityByHourOfDay(hours);

    MetricSummary summary = summaryOf(List.of(), Metric.HUMIDITY);
    SummaryCard high = cardOfKind(summary, CardKind.EXTREME_HIGH);

    assertThat(high.date()).isNull();
    assertThat(high.rangeStart()).isNull();
    assertThat(high.windowStart()).isEqualTo(LocalTime.of(3, 0));
    assertThat(high.windowEnd()).isEqualTo(LocalTime.of(6, 0));
    assertThat(high.value()).isEqualTo(90.0);
  }

  /**
   * The card ranks three-hour stretches, not single hours. The fixture separates the two: hour 15
   * alone is by far the driest reading, but the three hours around 03:00 are collectively drier, so
   * an hour-ranked card would answer 15:00 and a window-ranked one will not.
   *
   * <p>This is the whole reason for the window. A lone spike is one hour of one day's weather; a
   * stretch is the shape of the site's day.
   */
  @Test
  void driestStretch_ranksWindows_notTheSingleDriestHour() {
    Double[] hours = flatHours(60.0);
    hours[15] = 10.0;
    hours[2] = 20.0;
    hours[3] = 20.0;
    hours[4] = 20.0;
    givenHumidityByHourOfDay(hours);

    SummaryCard low = cardOfKind(summaryOf(List.of(), Metric.HUMIDITY), CardKind.EXTREME_LOW);

    assertThat(low.windowStart()).isEqualTo(LocalTime.of(2, 0));
    assertThat(low.windowEnd()).isEqualTo(LocalTime.of(5, 0));
    assertThat(low.value()).isEqualTo(20.0);
  }

  /**
   * A stretch may run through midnight, and then its end is <em>earlier</em> on the clock than its
   * start. A scan that stopped at hour 23 would still find an answer here — the second-best one —
   * and report it with no sign that it had missed the real peak.
   */
  @Test
  void mostHumidStretch_wrapsPastMidnight() {
    Double[] hours = flatHours(40.0);
    hours[23] = 95.0;
    hours[0] = 95.0;
    hours[1] = 95.0;
    givenHumidityByHourOfDay(hours);

    SummaryCard high = cardOfKind(summaryOf(List.of(), Metric.HUMIDITY), CardKind.EXTREME_HIGH);

    assertThat(high.windowStart()).isEqualTo(LocalTime.of(23, 0));
    assertThat(high.windowEnd()).isEqualTo(LocalTime.of(2, 0));
    assertThat(high.value()).isEqualTo(95.0);
  }

  /**
   * An hour the station only caught on a couple of days is not comparable with one it caught every
   * day, so it is excluded rather than ranked. Here the thinly-sampled hours hold the lowest
   * readings in the range: without the coverage floor they would win the card outright.
   */
  @Test
  void driestStretch_ignoresHoursObservedOnTooFewDays() {
    List<HourOfDayAverage> rows = new ArrayList<>();
    for (int hour = 0; hour < 24; hour++) {
      double value = (hour >= 2 && hour <= 4) ? 20.0 : 60.0;
      long samples = (hour >= 10 && hour <= 12) ? ENOUGH_SAMPLES - 1 : ENOUGH_SAMPLES;
      rows.add(new HourOfDayAverage(hour, hour >= 10 && hour <= 12 ? 5.0 : value, samples));
    }
    given(hourlyWeatherRecordRepository.findHumidityByHourOfDay(any(), any(), any()))
        .willReturn(rows);

    SummaryCard low = cardOfKind(summaryOf(List.of(), Metric.HUMIDITY), CardKind.EXTREME_LOW);

    assertThat(low.windowStart()).isEqualTo(LocalTime.of(2, 0));
    assertThat(low.value()).isEqualTo(20.0);
  }

  /**
   * With gaps every other hour no window is complete, and a window is never averaged around a hole
   * — a mean over two hours is not comparable with the three-hour means it would be ranked against.
   * The cards are then omitted, exactly as any card with nothing behind it is.
   */
  @Test
  void humidityWindows_areOmittedWithoutThreeUnbrokenHours() {
    Double[] hours = new Double[24];
    for (int hour = 0; hour < 24; hour += 2) {
      hours[hour] = 50.0;
    }
    givenHumidityByHourOfDay(hours);

    MetricSummary summary = summaryOf(List.of(), Metric.HUMIDITY);

    assertThat(cardOfKind(summary, CardKind.EXTREME_HIGH)).isNull();
    assertThat(cardOfKind(summary, CardKind.EXTREME_LOW)).isNull();
  }

  /**
   * Both cards come from one query, and that query covers the whole inclusive range.
   *
   * <p>Two regressions in one test. The bounds are half-open, so the end has to be the start of the
   * day <em>after</em> the range's last date — stopping at the last date itself silently drops the
   * newest day of every range, which is the one the reader is most likely looking at. And the two
   * cards must share a fetch: building them independently doubles the round trip for a payload the
   * modal already re-requests on every metric tab.
   */
  @Test
  void humidityWindows_queryTheInclusiveRangeExactlyOnce() {
    givenHumidityByHourOfDay(flatHours(60.0));

    MetricSummary summary = summaryOf(List.of(), Metric.HUMIDITY);

    ArgumentCaptor<Instant> from = ArgumentCaptor.forClass(Instant.class);
    ArgumentCaptor<Instant> to = ArgumentCaptor.forClass(Instant.class);
    verify(hourlyWeatherRecordRepository, times(1))
        .findHumidityByHourOfDay(eq(UTC.getId()), from.capture(), to.capture());

    assertThat(from.getValue()).isEqualTo(START.atStartOfDay(UTC).toInstant());
    assertThat(to.getValue()).isEqualTo(END.plusDays(1).atStartOfDay(UTC).toInstant());
    assertThat(summary.cards()).isNotEmpty();
  }

  @Test
  void metricWithoutABuilder_yieldsNoCardsRatherThanThrowing() {
    // The cards ride along with the chart data, so throwing here would take the whole range
    // response down for a metric that charts perfectly well.
    MetricSummary summary =
        summaryOf(List.of(day(START, DayPeriod.DAY, 1.0, 5.0)), Metric.UV_INDEX);

    assertThat(summary.metric()).isEqualTo(Metric.UV_INDEX);
    assertThat(summary.cards()).isEmpty();
  }

  @Test
  void everySupportedMetricProducesLabelledCards() {
    for (Metric metric : List.of(Metric.TEMPERATURE, Metric.PRESSURE, Metric.HUMIDITY)) {
      MetricSummary summary = summaryOf(List.of(), metric);
      assertThat(summary.metric()).isEqualTo(metric);
      assertThat(summary.cards()).isEmpty();
    }
  }

  // ---- surface wetness: stored inverted, reported as a percentage ----

  private static DayPeriodMetrics wetnessDay(LocalDate date, double rawMin, double rawMax) {
    DayPeriodMetrics row = new DayPeriodMetrics();
    row.setDate(date);
    row.setPeriod(DayPeriod.FULL);
    row.setSurfaceWetnessMin(rawMin);
    row.setSurfaceWetnessMax(rawMax);
    row.setSurfaceWetnessAvg((rawMin + rawMax) / 2);
    return row;
  }

  /**
   * The whole hazard in one test: a higher ADC count is a drier surface, so the wettest day is the
   * one with the <em>lowest</em> stored reading. Selecting it with the same comparator the other
   * metrics use would return the driest day under a "Wettest day" heading.
   */
  @Test
  void wettestDay_picksTheLowestRawCount_andReportsItAsAPercentage() {
    List<DayPeriodMetrics> data =
        List.of(
            wetnessDay(START, 3000.0, 3226.0), // barely damp
            wetnessDay(START.plusDays(1), 700.0, 3200.0), // soaked at some point
            wetnessDay(START.plusDays(2), 2500.0, 3210.0));

    MetricSummary summary = summaryOf(data, Metric.SURFACE_WETNESS);
    SummaryCard wettest = cardOfKind(summary, CardKind.EXTREME_HIGH);

    assertThat(wettest.label()).isEqualTo("Wettest day");
    assertThat(wettest.date()).isEqualTo(START.plusDays(1));
    assertThat(wettest.value()).isCloseTo(82.14, offset(0.01));
  }

  @Test
  void driestDay_picksTheHighestRawCount_andReportsTheSmallerPercentage() {
    List<DayPeriodMetrics> data =
        List.of(
            wetnessDay(START, 3000.0, 3226.0), // driest moment of the range
            wetnessDay(START.plusDays(1), 700.0, 3200.0));

    MetricSummary summary = summaryOf(data, Metric.SURFACE_WETNESS);
    SummaryCard driest = cardOfKind(summary, CardKind.EXTREME_LOW);
    SummaryCard wettest = cardOfKind(summary, CardKind.EXTREME_HIGH);

    assertThat(driest.label()).isEqualTo("Driest day");
    assertThat(driest.date()).isEqualTo(START);
    assertThat(driest.value()).isCloseTo(0.13, offset(0.01));
    // The pair has to stay the right way round once converted.
    assertThat(driest.value()).isLessThan(wettest.value());
  }

  /**
   * Wetness gets the two extremes and nothing else. A least-squares fit over a signal that is dry
   * for days and then soaked for an afternoon reports where the wet days happened to fall in the
   * range, not a direction the weather took.
   */
  @Test
  void surfaceWetness_hasNoTrendCard() {
    List<DayPeriodMetrics> data =
        List.of(
            wetnessDay(START, 700.0, 1000.0),
            wetnessDay(START.plusDays(1), 1800.0, 2100.0),
            wetnessDay(START.plusDays(2), 3000.0, 3200.0));

    MetricSummary summary = summaryOf(data, Metric.SURFACE_WETNESS);

    assertThat(summary.cards()).hasSize(2);
    assertThat(cardOfKind(summary, CardKind.TREND)).isNull();
  }

  @Test
  void cardsWithoutDataAreOmittedRatherThanEmpty() {
    // Both extremes are answerable from a single date, but a trend is not: the fit needs two
    // points on different days.
    MetricSummary oneDate =
        summaryOf(
            List.of(day(START, DayPeriod.DAY, 12.0, 25.0), day(START, DayPeriod.NIGHT, 2.0, 8.0)),
            Metric.TEMPERATURE);
    assertThat(oneDate.cards()).hasSize(2);
    assertThat(cardOfKind(oneDate, CardKind.TREND)).isNull();

    // Dates rolled up before the day/night split have a FULL row alone, and no temperature card
    // reads FULL — so such a range yields nothing rather than falling back to it.
    MetricSummary fullOnly =
        summaryOf(List.of(day(START, DayPeriod.FULL, 1.0, 5.0)), Metric.TEMPERATURE);
    assertThat(fullOnly.cards()).isEmpty();
  }
}
