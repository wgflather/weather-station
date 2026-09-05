package com.flather.weatherstation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.offset;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.config.LocationContext;
import com.flather.weatherstation.config.WeatherValidationConfig;
import com.flather.weatherstation.domain.constant.DayPeriod;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.DayPeriodMetrics;
import com.flather.weatherstation.dto.analytics.ChartPointDto;
import com.flather.weatherstation.dto.analytics.DailyHistoryDto;
import com.flather.weatherstation.dto.analytics.FullDaySummary;
import com.flather.weatherstation.dto.analytics.MetricSummary;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.dto.weather.PeriodMetricDto;
import com.flather.weatherstation.mapper.WeatherHistoryMapper;
import com.flather.weatherstation.repository.DailyWeatherRecordRepository;
import com.flather.weatherstation.repository.HourlyWeatherRecordRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.NoSuchElementException;
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
class WeatherHistoryServiceTest {

  @Mock HourlyWeatherRecordRepository hourlyRepository;
  @Mock DailyWeatherRecordRepository dailyRepository;
  @Mock AnalyticsService analyticsService;
  @Mock ConfigurationCache configurationCache;
  @Mock AstronomySearch astronomySearch;
  @Mock SummaryCardService summaryCardService;
  @Mock WeatherHistoryMapper mapper;
  @InjectMocks WeatherHistoryService service;

  private static final ZoneId UTC = ZoneId.of("UTC");

  // The station's own calibration, so a swapped pair would be visible in the assertion below.
  private static final int WET_BASELINE = 150;
  private static final int DRY_BASELINE = 3230;

  @BeforeEach
  void setup() {
    LocationContext location = new LocationContext(52.5, 13.4, 34.0, UTC, null);
    given(configurationCache.getLocationContext()).willReturn(location);
    given(configurationCache.getValidationConfig())
        .willReturn(
            new WeatherValidationConfig(
                -50,
                60,
                900,
                1100,
                0,
                100,
                20,
                5.0,
                10.0,
                WET_BASELINE,
                DRY_BASELINE,
                0.0,
                60.0,
                15.0,
                0.0,
                15.0,
                5.0));
  }

  // ---- getDayChart: date resolution and routing based on age ----

  @Test
  void getDayChart_convertsDateToStationLocalDayBounds() {
    LocalDate date = LocalDate.now(UTC).minusDays(1);
    Instant expectedFrom = date.atStartOfDay(UTC).toInstant();
    Instant expectedTo = date.plusDays(1).atStartOfDay(UTC).toInstant();

    given(analyticsService.getMetricChart(expectedFrom, expectedTo, Metric.HUMIDITY, 60))
        .willReturn(List.of());

    ChartDto result = service.getDayChart(date, Metric.HUMIDITY);

    assertThat(result.metric()).isEqualTo("Humidity");
    verify(analyticsService).getMetricChart(expectedFrom, expectedTo, Metric.HUMIDITY, 60);
  }

  @Test
  void getDayChart_recentDate_usesAnalyticsService() {
    LocalDate date = LocalDate.now(UTC).minusDays(1);
    ChartPointDto point = new ChartPointDto(ZonedDateTime.now(UTC), 21.0);

    given(
            analyticsService.getMetricChart(
                any(Instant.class), any(Instant.class), eq(Metric.TEMPERATURE), eq(60)))
        .willReturn(List.of(point));

    ChartDto result = service.getDayChart(date, Metric.TEMPERATURE);

    assertThat(result.metric()).isEqualTo("Temperature");
    assertThat(result.chartPoints()).hasSize(1);
    verifyNoInteractions(hourlyRepository);
  }

  @Test
  void getDayChart_oldDate_usesHourlyRepository() {
    // 40 days back is beyond the raw retention cutoff, so the pre-rolled table answers
    LocalDate date = LocalDate.now(UTC).minusDays(40);
    Instant expectedFrom = date.atStartOfDay(UTC).toInstant();
    DataPoint dataPoint = new DataPoint(expectedFrom, 20.0);

    given(hourlyRepository.findChartTemperature(eq(expectedFrom), any(Instant.class)))
        .willReturn(List.of(dataPoint));
    given(analyticsService.toChartPoints(List.of(dataPoint)))
        .willReturn(List.of(new ChartPointDto(expectedFrom.atZone(UTC), 20.0)));

    ChartDto result = service.getDayChart(date, Metric.TEMPERATURE);

    assertThat(result.metric()).isEqualTo("Temperature");
    assertThat(result.chartPoints()).hasSize(1);
    verify(hourlyRepository).findChartTemperature(eq(expectedFrom), any(Instant.class));
    verify(analyticsService, never()).getMetricChart(any(), any(), any(), anyInt());
  }

  /**
   * The tier decides which table is read, not how the value is scaled. Surface wetness is converted
   * to a percentage inside each tier's own query, so the hourly one has to be handed the same
   * baselines the raw one gets — otherwise the chart reads 0–100 on one side of the retention
   * boundary and raw ADC counts on the other. Both are ints, so the order is pinned too: swapping
   * them compiles and would invert every wetness chart.
   */
  @Test
  void getDayChart_oldDateSurfaceWetness_passesBaselinesToTheHourlyQuery() {
    LocalDate date = LocalDate.now(UTC).minusDays(40);
    Instant expectedFrom = date.atStartOfDay(UTC).toInstant();

    given(hourlyRepository.findChartSurfaceWetness(any(), any(), anyInt(), anyInt()))
        .willReturn(List.of());

    service.getDayChart(date, Metric.SURFACE_WETNESS);

    verify(hourlyRepository)
        .findChartSurfaceWetness(
            eq(expectedFrom), any(Instant.class), eq(DRY_BASELINE), eq(WET_BASELINE));
  }

  @Test
  void getDayChart_oldDatePressure_usesHourlyPressureMethod() {
    LocalDate date = LocalDate.now(UTC).minusDays(40);

    given(hourlyRepository.findChartPressure(any(), any())).willReturn(List.of());

    service.getDayChart(date, Metric.PRESSURE);

    verify(hourlyRepository).findChartPressure(any(), any());
  }

  // ---- getAvailableDates ----

  @Test
  void getAvailableDates_delegatesToRepository() {
    LocalDate from = LocalDate.of(2026, 6, 1);
    LocalDate to = LocalDate.of(2026, 6, 30);

    given(dailyRepository.findDatesBetween(from, to))
        .willReturn(List.of(LocalDate.of(2026, 6, 14), LocalDate.of(2026, 6, 15)));

    List<LocalDate> result = service.getAvailableDates(from, to);

    assertThat(result).containsExactly(LocalDate.of(2026, 6, 14), LocalDate.of(2026, 6, 15));
  }

  // ---- getHistoryDailySummary ----

  @Test
  void getHistoryDailySummary_groupsRowsByPeriod() {
    LocalDate date = LocalDate.of(2026, 6, 15);

    DayPeriodMetrics fullRow = periodRow(date, DayPeriod.FULL);
    DayPeriodMetrics dayRow = periodRow(date, DayPeriod.DAY);
    DayPeriodMetrics nightRow = periodRow(date, DayPeriod.NIGHT);

    given(dailyRepository.findByDate(date)).willReturn(List.of(fullRow, dayRow, nightRow));
    given(mapper.toDto(fullRow)).willReturn(periodDto(DayPeriod.FULL, 21.5));
    given(mapper.toDto(dayRow)).willReturn(periodDto(DayPeriod.DAY, 25.0));
    given(mapper.toDto(nightRow)).willReturn(periodDto(DayPeriod.NIGHT, 16.0));

    FullDaySummary result = service.getHistoryDailySummary(date);

    assertThat(result.date()).isEqualTo(date);
    assertThat(result.fullDay().getTemperatureAvg()).isEqualTo(21.5);
    assertThat(result.day().getTemperatureAvg()).isEqualTo(25.0);
    assertThat(result.night().getTemperatureAvg()).isEqualTo(16.0);
  }

  @Test
  void getHistoryDailySummary_leavesDayAndNightNull_whenOnlyFullRowExists() {
    LocalDate date = LocalDate.of(2026, 6, 15);
    DayPeriodMetrics fullRow = periodRow(date, DayPeriod.FULL);

    given(dailyRepository.findByDate(date)).willReturn(List.of(fullRow));
    given(mapper.toDto(fullRow)).willReturn(periodDto(DayPeriod.FULL, 21.5));

    FullDaySummary result = service.getHistoryDailySummary(date);

    assertThat(result.fullDay()).isNotNull();
    assertThat(result.day()).isNull();
    assertThat(result.night()).isNull();
  }

  @Test
  void getHistoryDailySummary_notFound_throwsNoSuchElement() {
    LocalDate date = LocalDate.of(2026, 6, 15);
    given(dailyRepository.findByDate(date)).willReturn(List.of());

    assertThatThrownBy(() -> service.getHistoryDailySummary(date))
        .isInstanceOf(NoSuchElementException.class)
        .hasMessageContaining("2026-06-15");
  }

  // ---- getDailyHistory ----

  @Test
  void getDailyHistory_groupsPeriodRowsIntoOneSummaryPerDate() {
    LocalDate from = LocalDate.of(2026, 6, 14);
    LocalDate to = LocalDate.of(2026, 6, 15);

    DayPeriodMetrics d1Full = periodRow(from, DayPeriod.FULL);
    DayPeriodMetrics d1Night = periodRow(from, DayPeriod.NIGHT);
    DayPeriodMetrics d2Full = periodRow(to, DayPeriod.FULL);

    given(dailyRepository.findByDateBetweenOrderByDateAsc(from, to))
        .willReturn(List.of(d1Full, d1Night, d2Full));
    given(mapper.toDto(d1Full)).willReturn(periodDto(DayPeriod.FULL, 20.0));
    given(mapper.toDto(d1Night)).willReturn(periodDto(DayPeriod.NIGHT, 14.0));
    given(mapper.toDto(d2Full)).willReturn(periodDto(DayPeriod.FULL, 22.0));

    List<FullDaySummary> result = service.getDailyHistory(from, to, Metric.TEMPERATURE).days();

    // Three rows collapse to two dates — a caller iterating them flat would have averaged the
    // NIGHT row in with the FULL ones.
    assertThat(result).hasSize(2);
    assertThat(result.get(0).date()).isEqualTo(from);
    assertThat(result.get(0).fullDay().getTemperatureAvg()).isEqualTo(20.0);
    assertThat(result.get(0).night().getTemperatureAvg()).isEqualTo(14.0);
    assertThat(result.get(0).day()).isNull();
    assertThat(result.get(1).date()).isEqualTo(to);
    assertThat(result.get(1).fullDay().getTemperatureAvg()).isEqualTo(22.0);
  }

  private static DayPeriodMetrics periodRow(LocalDate date, DayPeriod period) {
    DayPeriodMetrics row = new DayPeriodMetrics();
    row.setDate(date);
    row.setPeriod(period);
    return row;
  }

  private static PeriodMetricDto periodDto(DayPeriod period, double temperatureAvg) {
    return PeriodMetricDto.builder().period(period).temperatureAvg(temperatureAvg).build();
  }

  // ---- surface wetness: raw ADC out of the rollup, percentage out of the API ----

  /**
   * The ADC→percentage transform is decreasing, so the stored minimum count is the wettest moment
   * and has to come back as the maximum percentage. Converting each field in place would leave min
   * above max — the assertion that would catch it is the ordering, so it is asserted explicitly.
   */
  @Test
  void getHistoryDailySummary_surfaceWetness_convertsToPercentageAndSwapsMinMax() {
    LocalDate date = LocalDate.of(2026, 6, 15);
    DayPeriodMetrics row = periodRow(date, DayPeriod.FULL);

    given(dailyRepository.findByDate(date)).willReturn(List.of(row));
    given(mapper.toDto(row))
        .willReturn(
            PeriodMetricDto.builder()
                .period(DayPeriod.FULL)
                .surfaceWetnessMin(700.0) // lowest ADC count = wettest
                .surfaceWetnessMax(3226.0) // highest ADC count = driest
                .surfaceWetnessAvg(3194.0)
                .build());

    PeriodMetricDto result = service.getHistoryDailySummary(date).fullDay();

    // 3226 and 700 against the 150/3230 baselines, per MeteoMath.rawToWetnessPct
    assertThat(result.getSurfaceWetnessMin()).isCloseTo(0.13, offset(0.01));
    assertThat(result.getSurfaceWetnessMax()).isCloseTo(82.14, offset(0.01));
    assertThat(result.getSurfaceWetnessAvg()).isCloseTo(1.17, offset(0.01));
    assertThat(result.getSurfaceWetnessMin()).isLessThan(result.getSurfaceWetnessMax());
  }

  @Test
  void getHistoryDailySummary_surfaceWetness_leavesAbsentReadingsNull() {
    LocalDate date = LocalDate.of(2026, 6, 15);
    DayPeriodMetrics row = periodRow(date, DayPeriod.FULL);

    given(dailyRepository.findByDate(date)).willReturn(List.of(row));
    given(mapper.toDto(row)).willReturn(periodDto(DayPeriod.FULL, 21.5));

    PeriodMetricDto result = service.getHistoryDailySummary(date).fullDay();

    assertThat(result.getSurfaceWetnessMin()).isNull();
    assertThat(result.getSurfaceWetnessMax()).isNull();
    assertThat(result.getSurfaceWetnessAvg()).isNull();
    assertThat(result.getTemperatureAvg()).isEqualTo(21.5);
  }

  /** {@code /daily} goes through the same assembly, so the conversion has to reach it too. */
  @Test
  void getDailyHistory_surfaceWetness_convertsThePeriodRowsToo() {
    LocalDate date = LocalDate.of(2026, 6, 15);
    DayPeriodMetrics row = periodRow(date, DayPeriod.FULL);

    given(dailyRepository.findByDateBetweenOrderByDateAsc(date, date)).willReturn(List.of(row));
    given(mapper.toDto(row))
        .willReturn(
            PeriodMetricDto.builder()
                .period(DayPeriod.FULL)
                .surfaceWetnessMin(700.0)
                .surfaceWetnessMax(3226.0)
                .build());
    given(summaryCardService.buildSummary(List.of(row), Metric.SURFACE_WETNESS))
        .willReturn(new MetricSummary(Metric.SURFACE_WETNESS, List.of()));

    DailyHistoryDto result = service.getDailyHistory(date, date, Metric.SURFACE_WETNESS);

    PeriodMetricDto fullDay = result.days().getFirst().fullDay();
    assertThat(fullDay.getSurfaceWetnessMin()).isCloseTo(0.13, offset(0.01));
    assertThat(fullDay.getSurfaceWetnessMax()).isCloseTo(82.14, offset(0.01));
  }

  @Test
  void getDailyHistory_bundlesTheCardsFromTheSameRowsItCharts() {
    LocalDate from = LocalDate.of(2026, 6, 14);
    LocalDate to = LocalDate.of(2026, 6, 15);
    List<DayPeriodMetrics> rows = List.of(periodRow(from, DayPeriod.FULL));

    given(dailyRepository.findByDateBetweenOrderByDateAsc(from, to)).willReturn(rows);
    given(summaryCardService.buildSummary(rows, Metric.TEMPERATURE))
        .willReturn(new MetricSummary(Metric.TEMPERATURE, List.of()));

    DailyHistoryDto result = service.getDailyHistory(from, to, Metric.TEMPERATURE);

    assertThat(result.summary().metric()).isEqualTo(Metric.TEMPERATURE);
    // One query feeds both halves: the cards see the very rows the chart was built from.
    verify(dailyRepository, times(1)).findByDateBetweenOrderByDateAsc(from, to);
    verify(summaryCardService).buildSummary(rows, Metric.TEMPERATURE);
  }

  @Test
  void getDailyHistory_rejectsAnInvertedRange() {
    assertThatThrownBy(
            () ->
                service.getDailyHistory(
                    LocalDate.of(2026, 6, 15), LocalDate.of(2026, 6, 1), Metric.TEMPERATURE))
        .isInstanceOf(IllegalArgumentException.class);

    verifyNoInteractions(dailyRepository);
  }

  @Test
  void getDailyHistory_rejectsARangeLongerThanAYear() {
    LocalDate from = LocalDate.of(2020, 1, 1);

    assertThatThrownBy(() -> service.getDailyHistory(from, from.plusDays(400), Metric.TEMPERATURE))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("401");

    verifyNoInteractions(dailyRepository);
  }
}
