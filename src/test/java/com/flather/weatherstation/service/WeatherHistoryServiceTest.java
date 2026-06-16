package com.flather.weatherstation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.config.LocationContext;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.DailyWeatherRecord;
import com.flather.weatherstation.dto.analytics.ChartPointDto;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.dto.weather.DailyWeatherRecordDto;
import com.flather.weatherstation.mapper.WeatherHistoryMapper;
import com.flather.weatherstation.repository.DailyWeatherRecordRepository;
import com.flather.weatherstation.repository.HourlyWeatherRecordRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Optional;
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

  // ---- getDailyChartPoints ----

  @Test
  void getDailyChartPoints_mapsTemperatureAvg() {
    LocalDate from = LocalDate.of(2026, 6, 1);
    LocalDate to = LocalDate.of(2026, 6, 7);

    DailyWeatherRecord record = new DailyWeatherRecord();
    record.setDate(LocalDate.of(2026, 6, 1));
    record.setTemperatureAvg(21.5);

    given(dailyRepository.findByDateBetweenOrderByDateAsc(from, to)).willReturn(List.of(record));

    ChartDto result = service.getDailyChartPoints(from, to, Metric.TEMPERATURE);

    assertThat(result.metric()).isEqualTo("Temperature");
    assertThat(result.chartPoints()).hasSize(1);
    assertThat(result.chartPoints().get(0).hourlyValue()).isEqualTo(21.5);
  }

  @Test
  void getDailyChartPoints_mapsPressureAvg() {
    LocalDate from = LocalDate.of(2026, 6, 1);
    LocalDate to = LocalDate.of(2026, 6, 7);

    DailyWeatherRecord record = new DailyWeatherRecord();
    record.setDate(LocalDate.of(2026, 6, 1));
    record.setPressureAvg(1013.5);

    given(dailyRepository.findByDateBetweenOrderByDateAsc(from, to)).willReturn(List.of(record));

    ChartDto result = service.getDailyChartPoints(from, to, Metric.PRESSURE);

    assertThat(result.chartPoints().get(0).hourlyValue()).isEqualTo(1013.5);
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
  void getHistoryDailySummary_found_returnsDto() {
    LocalDate date = LocalDate.of(2026, 6, 15);
    DailyWeatherRecord record = new DailyWeatherRecord();
    DailyWeatherRecordDto dto = DailyWeatherRecordDto.builder().date(date).build();

    given(dailyRepository.findByDate(date)).willReturn(Optional.of(record));
    given(mapper.toDto(record)).willReturn(dto);

    DailyWeatherRecordDto result = service.getHistoryDailySummary(date);

    assertThat(result.getDate()).isEqualTo(date);
  }

  @Test
  void getHistoryDailySummary_notFound_throwsNoSuchElement() {
    LocalDate date = LocalDate.of(2026, 6, 15);
    given(dailyRepository.findByDate(date)).willReturn(Optional.empty());

    assertThatThrownBy(() -> service.getHistoryDailySummary(date))
        .isInstanceOf(NoSuchElementException.class)
        .hasMessageContaining("2026-06-15");
  }
}
