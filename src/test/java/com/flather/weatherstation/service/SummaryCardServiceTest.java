package com.flather.weatherstation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.offset;
import static org.mockito.BDDMockito.given;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.config.LocationContext;
import com.flather.weatherstation.config.WeatherValidationConfig;
import com.flather.weatherstation.domain.constant.CardKind;
import com.flather.weatherstation.domain.constant.DayPeriod;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.DayPeriodMetrics;
import com.flather.weatherstation.dto.analytics.MetricSummary;
import com.flather.weatherstation.dto.analytics.SummaryCard;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
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

  @Mock ConfigurationCache configurationCache;
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

    SummaryCard low =
        cardOfKind(service.buildSummary(data, Metric.TEMPERATURE), CardKind.EXTREME_LOW);

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

    MetricSummary summary = service.buildSummary(data, Metric.TEMPERATURE);
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
        service.buildSummary(List.of(day(START, DayPeriod.DAY, 12.0, 25.0)), Metric.TEMPERATURE);

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

    SummaryCard trend = cardOfKind(service.buildSummary(data, Metric.TEMPERATURE), CardKind.TREND);

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

    SummaryCard trend = cardOfKind(service.buildSummary(data, Metric.TEMPERATURE), CardKind.TREND);

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

    MetricSummary summary = service.buildSummary(data, Metric.TEMPERATURE);

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

    MetricSummary summary = service.buildSummary(List.of(full, daytime), Metric.PRESSURE);

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

    assertThat(cardOfKind(service.buildSummary(data, Metric.PRESSURE), CardKind.TREND).value())
        .isEqualTo(0.0);
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
   * Two properties at once: humidity reads FULL rows, and it ranks them on the mean. Both peaks sit
   * near 100 % — which is why the peak is the wrong thing to rank on for this metric — so a
   * peak-ranked card would be deciding between 97 and 99 and would report a different day.
   */
  @Test
  void humidityCards_readFullDayRows_rankedByAverage() {
    List<DayPeriodMetrics> data =
        List.of(
            humidityRow(START, DayPeriod.FULL, 38.0, 97.0, 65.0),
            humidityRow(START, DayPeriod.DAY, 38.0, 61.0, 48.0),
            humidityRow(START.plusDays(1), DayPeriod.FULL, 60.0, 99.0, 80.0),
            humidityRow(START.plusDays(1), DayPeriod.DAY, 55.0, 78.0, 70.0));

    MetricSummary summary = service.buildSummary(data, Metric.HUMIDITY);
    SummaryCard high = cardOfKind(summary, CardKind.EXTREME_HIGH);
    SummaryCard low = cardOfKind(summary, CardKind.EXTREME_LOW);

    assertThat(high.value()).isEqualTo(80.0);
    assertThat(high.date()).isEqualTo(START.plusDays(1));
    assertThat(low.value()).isEqualTo(65.0);
    assertThat(low.date()).isEqualTo(START);
  }

  @Test
  void metricWithoutABuilder_yieldsNoCardsRatherThanThrowing() {
    // The cards ride along with the chart data, so throwing here would take the whole range
    // response down for a metric that charts perfectly well.
    MetricSummary summary =
        service.buildSummary(List.of(day(START, DayPeriod.DAY, 1.0, 5.0)), Metric.UV_INDEX);

    assertThat(summary.metric()).isEqualTo(Metric.UV_INDEX);
    assertThat(summary.cards()).isEmpty();
  }

  @Test
  void everySupportedMetricProducesLabelledCards() {
    for (Metric metric : List.of(Metric.TEMPERATURE, Metric.PRESSURE, Metric.HUMIDITY)) {
      MetricSummary summary = service.buildSummary(List.of(), metric);
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

    MetricSummary summary = service.buildSummary(data, Metric.SURFACE_WETNESS);
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

    MetricSummary summary = service.buildSummary(data, Metric.SURFACE_WETNESS);
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

    MetricSummary summary = service.buildSummary(data, Metric.SURFACE_WETNESS);

    assertThat(summary.cards()).hasSize(2);
    assertThat(cardOfKind(summary, CardKind.TREND)).isNull();
  }

  @Test
  void cardsWithoutDataAreOmittedRatherThanEmpty() {
    // Both extremes are answerable from a single date, but a trend is not: the fit needs two
    // points on different days.
    MetricSummary oneDate =
        service.buildSummary(
            List.of(day(START, DayPeriod.DAY, 12.0, 25.0), day(START, DayPeriod.NIGHT, 2.0, 8.0)),
            Metric.TEMPERATURE);
    assertThat(oneDate.cards()).hasSize(2);
    assertThat(cardOfKind(oneDate, CardKind.TREND)).isNull();

    // Dates rolled up before the day/night split have a FULL row alone, and no temperature card
    // reads FULL — so such a range yields nothing rather than falling back to it.
    MetricSummary fullOnly =
        service.buildSummary(List.of(day(START, DayPeriod.FULL, 1.0, 5.0)), Metric.TEMPERATURE);
    assertThat(fullOnly.cards()).isEmpty();
  }
}
