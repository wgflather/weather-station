package com.flather.weatherstation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.config.LocationContext;
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

  @BeforeEach
  void setup() {
    LocationContext location = new LocationContext(52.5, 13.4, 34.0, UTC, null);
    given(configurationCache.getLocationContext()).willReturn(location);
  }

  // ---- getChart: routing based on age ----

  @Test
  void getChart_recentDate_usesAnalyticsService() {
    Instant from = Instant.now().minusSeconds(86400); // 1 day ago
    Instant to = Instant.now();
    ChartPointDto point = new ChartPointDto(ZonedDateTime.now(UTC), 21.0);

    given(
            analyticsService.getMetricChart(
                eq(from), any(Instant.class), eq(Metric.TEMPERATURE), eq(60)))
        .willReturn(List.of(point));

    ChartDto result = service.getChart(Metric.TEMPERATURE, from, to);

    assertThat(result.metric()).isEqualTo("Temperature");
    assertThat(result.chartPoints()).hasSize(1);
    verifyNoInteractions(hourlyRepository);
  }

  @Test
  void getChart_oldDate_usesHourlyRepository() {
    // 40 days ago is beyond the 30-day raw retention cutoff
    Instant from = Instant.now().minusSeconds(40L * 86400);
    Instant to = Instant.now().minusSeconds(35L * 86400);
    DataPoint dataPoint = new DataPoint(from, 20.0);

    given(hourlyRepository.findChartTemperature(eq(from), any(Instant.class)))
        .willReturn(List.of(dataPoint));

    ChartDto result = service.getChart(Metric.TEMPERATURE, from, to);

    assertThat(result.metric()).isEqualTo("Temperature");
    verify(hourlyRepository).findChartTemperature(eq(from), any(Instant.class));
    verifyNoInteractions(analyticsService);
  }

  @Test
  void getChart_oldDatePressure_usesHourlyPressureMethod() {
    Instant from = Instant.now().minusSeconds(40L * 86400);
    Instant to = Instant.now().minusSeconds(35L * 86400);

    given(hourlyRepository.findChartPressure(any(), any())).willReturn(List.of());

    service.getChart(Metric.PRESSURE, from, to);

    verify(hourlyRepository).findChartPressure(any(), any());
  }

  // ---- getDayChart ----

  @Test
  void getDayChart_convertsDateToInstantRange_andDelegates() {
    LocalDate date = LocalDate.of(2026, 6, 15);
    Instant expectedFrom = date.atStartOfDay(UTC).toInstant();

    given(
            analyticsService.getMetricChart(
                eq(expectedFrom), any(Instant.class), eq(Metric.HUMIDITY), eq(60)))
        .willReturn(List.of());

    ChartDto result = service.getDayChart(date, Metric.HUMIDITY);

    assertThat(result.metric()).isEqualTo("Humidity");
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
