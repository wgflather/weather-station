package com.flather.weatherstation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.config.LocationContext;
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

  @Test
  void coldestDay_picksTheLowestMinimum_notTheHighest() {
    List<DayPeriodMetrics> data =
        List.of(
            day(START, DayPeriod.DAY, 12.0, 25.0),
            day(START.plusDays(1), DayPeriod.DAY, 4.0, 19.0), // the genuinely coldest
            day(START.plusDays(2), DayPeriod.DAY, 15.0, 31.0));

    SummaryCard low =
        cardOfKind(service.buildSummary(data, Metric.TEMPERATURE), CardKind.EXTREME_LOW);

    assertThat(low).isNotNull();
    assertThat(low.value()).isEqualTo(4.0);
    assertThat(low.date()).isEqualTo(START.plusDays(1));
  }

  @Test
  void extremeCards_carryDistinctKinds() {
    List<DayPeriodMetrics> data =
        List.of(
            day(START, DayPeriod.DAY, 12.0, 25.0),
            day(START.plusDays(1), DayPeriod.DAY, 4.0, 31.0));

    MetricSummary summary = service.buildSummary(data, Metric.TEMPERATURE);

    assertThat(cardOfKind(summary, CardKind.EXTREME_HIGH).value()).isEqualTo(31.0);
    assertThat(cardOfKind(summary, CardKind.EXTREME_LOW).value()).isEqualTo(4.0);
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

  @Test
  void cardsReadDaytimeRows_ignoringFullAndNight() {
    List<DayPeriodMetrics> data =
        List.of(
            day(START, DayPeriod.DAY, 12.0, 25.0),
            day(START, DayPeriod.NIGHT, -5.0, 8.0), // colder, but not daytime
            day(START, DayPeriod.FULL, -5.0, 25.0),
            day(START.plusDays(1), DayPeriod.DAY, 9.0, 27.0));

    MetricSummary summary = service.buildSummary(data, Metric.TEMPERATURE);

    assertThat(cardOfKind(summary, CardKind.EXTREME_LOW).value()).isEqualTo(9.0);
    assertThat(cardOfKind(summary, CardKind.EXTREME_HIGH).value()).isEqualTo(27.0);
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

  @Test
  void humidityCards_readTheWholeDay_soThePreDawnPeakIsNotLost() {
    DayPeriodMetrics full = new DayPeriodMetrics();
    full.setDate(START);
    full.setPeriod(DayPeriod.FULL);
    full.setHumidityMin(38.0);
    full.setHumidityMax(97.0); // humidity peaks before dawn, not during the day
    full.setHumidityAvg(65.0);

    DayPeriodMetrics daytime = new DayPeriodMetrics();
    daytime.setDate(START);
    daytime.setPeriod(DayPeriod.DAY);
    daytime.setHumidityMin(38.0);
    daytime.setHumidityMax(61.0);
    daytime.setHumidityAvg(48.0);

    MetricSummary summary = service.buildSummary(List.of(full, daytime), Metric.HUMIDITY);

    assertThat(cardOfKind(summary, CardKind.EXTREME_HIGH).value()).isEqualTo(97.0);
    assertThat(cardOfKind(summary, CardKind.EXTREME_LOW).value()).isEqualTo(38.0);
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

  @Test
  void cardsWithoutDataAreOmittedRatherThanEmpty() {
    // One day cannot support a trend, and a range with no daytime rows supports nothing.
    MetricSummary single =
        service.buildSummary(List.of(day(START, DayPeriod.DAY, 12.0, 25.0)), Metric.TEMPERATURE);
    assertThat(single.cards()).hasSize(2);
    assertThat(cardOfKind(single, CardKind.TREND)).isNull();

    MetricSummary nightOnly =
        service.buildSummary(List.of(day(START, DayPeriod.NIGHT, 1.0, 5.0)), Metric.TEMPERATURE);
    assertThat(nightOnly.cards()).isEmpty();
  }
}
