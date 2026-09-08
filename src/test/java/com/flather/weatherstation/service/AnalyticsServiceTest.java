package com.flather.weatherstation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.cache.SensorStateCache;
import com.flather.weatherstation.config.LocationContext;
import com.flather.weatherstation.config.WeatherValidationConfig;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.constant.WindAggregation;
import com.flather.weatherstation.dto.analytics.ChartPointDto;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.mapper.MetricDataDetailsMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Arrays;
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
class AnalyticsServiceTest {

  @Mock WeatherReportRepository repository;
  @Mock ConfigurationCache configurationCache;
  @Mock SensorStateCache sensorStateCache;
  @Mock MetricDataDetailsMapper metricDataDetailsMapper;
  @InjectMocks AnalyticsService service;

  private static final ZoneId UTC = ZoneId.of("UTC");
  private static final Instant HOUR = Instant.parse("2026-08-29T10:00:00Z");

  // The station's own calibration, so a wrong pairing of the two would be visible below.
  private static final int WET_BASELINE = 150;
  private static final int DRY_BASELINE = 3230;

  @BeforeEach
  void setup() {
    given(configurationCache.getLocationContext())
        .willReturn(new LocationContext(52.5, 13.4, 34.0, UTC, null));
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

  // ---- toChartPoints ----

  @Test
  void toChartPoints_mapsValuesThroughUnchanged_inTheStationZone() {
    List<DataPoint> points = List.of(new DataPoint(HOUR, 21.5));

    List<ChartPointDto> result = service.toChartPoints(points);

    assertThat(result).hasSize(1);
    assertThat(result.getFirst().hourlyValue()).isEqualTo(21.5);
    assertThat(result.getFirst().hour().getZone()).isEqualTo(UTC);
  }

  /**
   * A pre-rolled column is null for an hour with no valid reading, and wind direction is null
   * whenever the hour had no consistent bearing. {@code ChartPointDto.hourlyValue()} is a
   * primitive, so carrying one through would unbox to an NPE rather than render a gap.
   */
  @Test
  void toChartPoints_dropsNullValuesRatherThanUnboxingThem() {
    List<DataPoint> points =
        Arrays.asList(
            new DataPoint(HOUR, 180.0),
            new DataPoint(HOUR.plusSeconds(3600), null),
            new DataPoint(HOUR.plusSeconds(7200), 270.0));

    List<ChartPointDto> result = service.toChartPoints(points);

    assertThat(result).hasSize(2);
    assertThat(result.stream().map(ChartPointDto::hourlyValue)).containsExactly(180.0, 270.0);
  }

  // ---- getMetricChart: what each metric's query is handed ----

  /**
   * The wetness percentage conversion lives in the query, so what is testable here is that the
   * baselines reach it — and in the right order. Both are ints, so swapping them compiles and would
   * silently invert every wetness chart; this pins the pairing.
   */
  @Test
  void getMetricChart_surfaceWetness_passesBaselinesToTheQuery() {
    given(repository.findChartSurfaceWetness(any(), any(), any(), anyInt(), anyInt()))
        .willReturn(List.of());

    service.getMetricChart(HOUR, HOUR.plusSeconds(3600), Metric.SURFACE_WETNESS, 60);

    verify(repository)
        .findChartSurfaceWetness(
            eq(HOUR),
            eq(HOUR.plusSeconds(3600)),
            eq("60minutes"),
            eq(DRY_BASELINE),
            eq(WET_BASELINE));
  }

  @Test
  void getMetricChart_windDirection_passesTheSharedAggregationGates() {
    given(repository.findChartWindDirection(any(), any(), any(), anyDouble(), anyDouble()))
        .willReturn(List.of());

    service.getMetricChart(HOUR, HOUR.plusSeconds(3600), Metric.WIND_DIRECTION, 60);

    verify(repository)
        .findChartWindDirection(
            eq(HOUR),
            eq(HOUR.plusSeconds(3600)),
            eq("60minutes"),
            eq(WindAggregation.CALM_THRESHOLD_MS),
            eq(WindAggregation.MIN_DIRECTION_CONSISTENCY));
  }
}
