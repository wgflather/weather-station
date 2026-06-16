package com.flather.weatherstation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.config.LocationContext;
import com.flather.weatherstation.domain.constant.DataStatus;
import com.flather.weatherstation.dto.analytics.*;
import com.flather.weatherstation.dto.dashboard.DashboardLiveDto;
import com.flather.weatherstation.dto.dashboard.SystemHealthDashboardDto;
import java.time.ZoneId;
import java.time.ZonedDateTime;
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
class DashboardServiceTest {

  @Mock AnalyticsService analyticsService;
  @Mock AstronomySearch astronomySearchService;
  @Mock ConfigurationCache configurationCache;
  @InjectMocks DashboardService service;

  @BeforeEach
  void setup() {
    LocationContext location = new LocationContext(52.5, 13.4, 0.0, ZoneId.of("UTC"), null);
    given(configurationCache.getLocationContext()).willReturn(location);
    given(astronomySearchService.getSunSnapshot(any(ZonedDateTime.class))).willReturn(null);
    given(astronomySearchService.getMoonSnapshot(any(ZonedDateTime.class))).willReturn(null);
    given(astronomySearchService.dailyKey()).willReturn("2026-06-16@UTC");
  }

  // ---- getSystemHealth ----

  @Test
  void getSystemHealth_noData_returnsEmptyStatus() {
    given(analyticsService.findLastRecordTime()).willReturn(Optional.empty());

    SystemHealthDashboardDto result = service.getSystemHealth();

    assertThat(result.getStatus()).isEqualTo(DataStatus.EMPTY);
    assertThat(result.getLagMinutes()).isEqualTo(0);
    assertThat(result.getRecordsToday()).isEqualTo(0);
    assertThat(result.getLastMeasuredAt()).isNull();
  }

  @Test
  void getSystemHealth_recentData_returnsLiveStatus() {
    ZonedDateTime lastUpdate = ZonedDateTime.now(ZoneId.of("UTC")).minusMinutes(2);
    given(analyticsService.findLastRecordTime()).willReturn(Optional.of(lastUpdate));
    given(analyticsService.findTodayRecordsCount()).willReturn(48L);
    given(analyticsService.getLagMinutes(lastUpdate)).willReturn(2L);

    SystemHealthDashboardDto result = service.getSystemHealth();

    assertThat(result.getStatus()).isEqualTo(DataStatus.LIVE);
    assertThat(result.getRecordsToday()).isEqualTo(48L);
    assertThat(result.getLagMinutes()).isEqualTo(2L);
  }

  @Test
  void getSystemHealth_delayedData_returnsDelayedStatus() {
    ZonedDateTime lastUpdate = ZonedDateTime.now(ZoneId.of("UTC")).minusMinutes(7);
    given(analyticsService.findLastRecordTime()).willReturn(Optional.of(lastUpdate));
    given(analyticsService.findTodayRecordsCount()).willReturn(10L);
    given(analyticsService.getLagMinutes(lastUpdate)).willReturn(7L);

    SystemHealthDashboardDto result = service.getSystemHealth();

    assertThat(result.getStatus()).isEqualTo(DataStatus.DELAYED);
  }

  @Test
  void getSystemHealth_staleData_returnsStaleStatus() {
    ZonedDateTime lastUpdate = ZonedDateTime.now(ZoneId.of("UTC")).minusMinutes(60);
    given(analyticsService.findLastRecordTime()).willReturn(Optional.of(lastUpdate));
    given(analyticsService.findTodayRecordsCount()).willReturn(5L);
    given(analyticsService.getLagMinutes(lastUpdate)).willReturn(60L);

    SystemHealthDashboardDto result = service.getSystemHealth();

    assertThat(result.getStatus()).isEqualTo(DataStatus.STALE);
  }

  // ---- getDashboardLive ----

  @Test
  void getDashboardLive_noData_returnsEmptyMetrics() {
    given(analyticsService.findLastRecordTime()).willReturn(Optional.empty());

    DashboardLiveDto result = service.getDashboardLive();

    assertThat(result.systemHealth().getStatus()).isEqualTo(DataStatus.EMPTY);
    assertThat(result.metrics().getTemperature()).isNull();
    assertThat(result.dailyKey()).isEqualTo("2026-06-16@UTC");
    verify(analyticsService, never()).getTemperature();
  }

  @Test
  void getDashboardLive_withData_callsFullMetrics() {
    ZonedDateTime lastUpdate = ZonedDateTime.now(ZoneId.of("UTC")).minusMinutes(1);
    given(analyticsService.findLastRecordTime()).willReturn(Optional.of(lastUpdate));
    given(analyticsService.findTodayRecordsCount()).willReturn(48L);
    given(analyticsService.getLagMinutes(lastUpdate)).willReturn(1L);
    given(analyticsService.getTemperature())
        .willReturn(new TemperatureDto(21.5, null, 18.0, 25.0, null));
    given(analyticsService.getPressure()).willReturn(new PressureDto(1013.0, null, null, null));
    given(analyticsService.getHumidity()).willReturn(new HumidityDto(55.0, null, null, null));
    given(analyticsService.getSurfaceWetness()).willReturn(new SurfaceWetnessDto(null, null, null));

    DashboardLiveDto result = service.getDashboardLive();

    assertThat(result.systemHealth().getStatus()).isEqualTo(DataStatus.LIVE);
    assertThat(result.metrics().getTemperature().value()).isEqualTo(21.5);
    verify(analyticsService).getTemperature();
    verify(analyticsService).getPressure();
    verify(analyticsService).getHumidity();
    verify(analyticsService).getSurfaceWetness();
  }

  @Test
  void getDashboardLive_includesAstronomyData() {
    given(analyticsService.findLastRecordTime()).willReturn(Optional.empty());

    DashboardLiveDto result = service.getDashboardLive();

    assertThat(result.dailyKey()).isEqualTo("2026-06-16@UTC");
    verify(astronomySearchService).getSunSnapshot(any(ZonedDateTime.class));
    verify(astronomySearchService).getMoonSnapshot(any(ZonedDateTime.class));
    verify(astronomySearchService).dailyKey();
  }
}
