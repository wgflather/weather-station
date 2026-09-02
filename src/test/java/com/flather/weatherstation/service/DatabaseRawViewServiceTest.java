package com.flather.weatherstation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.config.LocationContext;
import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.repository.RawDatabaseViewRepository;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class DatabaseRawViewServiceTest {

  @Mock RawDatabaseViewRepository repository;
  @Mock ConfigurationCache configurationCache;
  @InjectMocks DatabaseRawViewService service;

  private static final Pageable PAGE = PageRequest.of(0, 50);
  private static final Page<WeatherRecord> EMPTY_PAGE = new PageImpl<>(List.of());

  @BeforeEach
  void setup() {
    LocationContext location = new LocationContext(52.5, 13.4, 0.0, ZoneId.of("UTC"), null);
    given(configurationCache.getLocationContext()).willReturn(location);
  }

  // ---- getRecords: no-filter path ----

  @Test
  void getRecords_allTrue_noFilters_returnsAllByDate() {
    given(repository.findAllByOrderByMeasuredAtDesc(PAGE)).willReturn(EMPTY_PAGE);

    service.getRecords(true, null, PAGE, null, null, null);

    verify(repository).findAllByOrderByMeasuredAtDesc(PAGE);
  }

  // ---- getRecords: quality-only path ----

  @Test
  void getRecords_allFalse_withQuality_returnsQualityFiltered() {
    given(repository.findAllByQuality(PAGE, DataQuality.OK)).willReturn(EMPTY_PAGE);

    service.getRecords(false, DataQuality.OK, PAGE, null, null, null);

    verify(repository).findAllByQuality(PAGE, DataQuality.OK);
  }

  // ---- getRecords: metric + quality path ----

  @Test
  void getRecords_withMetricAndQuality_delegatesToMetricMethod() {
    given(repository.findByTemperatureDataQuality(DataQuality.SPIKE, PAGE)).willReturn(EMPTY_PAGE);

    service.getRecords(false, DataQuality.SPIKE, PAGE, Metric.TEMPERATURE, null, null);

    verify(repository).findByTemperatureDataQuality(DataQuality.SPIKE, PAGE);
  }

  /**
   * Regression: WIND_DIRECTION used to route to findByWindDataQuality — the wind <em>speed</em>
   * column — so filtering by wind direction silently returned the wrong rows. Nothing failed,
   * because the two enum constants read alike and no test distinguished them.
   */
  @Test
  void getRecords_withWindDirection_doesNotFallBackToWindSpeed() {
    given(repository.findByWindDirectionDataQuality(DataQuality.ANOMALY, PAGE))
        .willReturn(EMPTY_PAGE);

    service.getRecords(false, DataQuality.ANOMALY, PAGE, Metric.WIND_DIRECTION, null, null);

    verify(repository).findByWindDirectionDataQuality(DataQuality.ANOMALY, PAGE);
    verify(repository, never()).findByWindDataQuality(any(), any());
  }

  // ---- getRecords: date-range path ----

  @Test
  void getRecords_withDateRange_returnsRecordsBetween() {
    LocalDate from = LocalDate.of(2026, 6, 1);
    LocalDate to = LocalDate.of(2026, 6, 7);

    given(repository.getRecordsBetween(any(), any(), eq(PAGE))).willReturn(EMPTY_PAGE);

    service.getRecords(true, null, PAGE, null, from, to);

    verify(repository).getRecordsBetween(any(), any(), eq(PAGE));
  }

  @Test
  void getRecords_withDateAndQuality_usesQualityBetween() {
    LocalDate from = LocalDate.of(2026, 6, 1);
    LocalDate to = LocalDate.of(2026, 6, 7);

    given(repository.findByQualityBetween(eq(DataQuality.OK), any(), any(), eq(PAGE)))
        .willReturn(EMPTY_PAGE);

    service.getRecords(false, DataQuality.OK, PAGE, null, from, to);

    verify(repository).findByQualityBetween(eq(DataQuality.OK), any(), any(), eq(PAGE));
  }

  @Test
  void getRecords_withMetricQualityAndDate_usesMetricQualityBetween() {
    LocalDate from = LocalDate.of(2026, 6, 1);
    LocalDate to = LocalDate.of(2026, 6, 7);

    given(repository.findByTemperatureQualityBetween(eq(DataQuality.OK), any(), any(), eq(PAGE)))
        .willReturn(EMPTY_PAGE);

    service.getRecords(false, DataQuality.OK, PAGE, Metric.TEMPERATURE, from, to);

    verify(repository).findByTemperatureQualityBetween(eq(DataQuality.OK), any(), any(), eq(PAGE));
  }

  // ---- deleteRecord ----

  @Test
  void deleteRecord_exists_deletesAndReturnsTrue() {
    given(repository.existsById(42L)).willReturn(true);

    boolean result = service.deleteRecord(42L);

    assertThat(result).isTrue();
    verify(repository).deleteById(42L);
  }

  @Test
  void deleteRecord_notExists_returnsFalse() {
    given(repository.existsById(99L)).willReturn(false);

    boolean result = service.deleteRecord(99L);

    assertThat(result).isFalse();
    verify(repository).existsById(99L);
  }

  // ---- getAvailableDates ----

  @Test
  void getAvailableDates_passesThroughZoneAndDates() {
    LocalDate from = LocalDate.of(2026, 6, 1);
    LocalDate to = LocalDate.of(2026, 6, 30);

    given(repository.findDistinctMeasuredDatesBetween(eq("UTC"), eq(from), eq(to)))
        .willReturn(List.of("2026-06-14", "2026-06-15"));

    List<String> result = service.getAvailableDates(from, to);

    assertThat(result).containsExactly("2026-06-14", "2026-06-15");
  }
}
