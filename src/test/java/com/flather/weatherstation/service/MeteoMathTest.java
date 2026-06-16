package com.flather.weatherstation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import com.flather.weatherstation.domain.constant.TrendDirection;
import com.flather.weatherstation.dto.analytics.TrendResult;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.util.MeteoMath;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

class MeteoMathTest {

  // ---- calculateDewPoint ----

  @Test
  void dewPoint_at100PercentHumidity_equalsTemperature() {
    double result = MeteoMath.calculateDewPoint(25.0, 100.0);
    assertThat(result).isCloseTo(25.0, within(0.2));
  }

  @Test
  void dewPoint_typicalValues_matchesExpected() {
    // At 20°C and 50% RH, dew point ≈ 9.3°C (Magnus formula)
    double result = MeteoMath.calculateDewPoint(20.0, 50.0);
    assertThat(result).isCloseTo(9.3, within(0.3));
  }

  @Test
  void dewPoint_highHumidity_closeToAmbient() {
    double result = MeteoMath.calculateDewPoint(30.0, 80.0);
    assertThat(result).isLessThan(30.0);
    assertThat(result).isGreaterThan(24.0);
  }

  // ---- calculateTrend ----

  @Test
  void trend_emptyList_returnsStable() {
    TrendResult result = MeteoMath.calculateTrend(List.of());
    assertThat(result.direction()).isEqualTo(TrendDirection.STABLE);
    assertThat(result.changeValue()).isEqualTo(0.0);
  }

  @Test
  void trend_singlePoint_returnsStable() {
    TrendResult result = MeteoMath.calculateTrend(List.of(new DataPoint(Instant.now(), 20.0)));
    assertThat(result.direction()).isEqualTo(TrendDirection.STABLE);
  }

  @Test
  void trend_allNullValues_returnsStable() {
    List<DataPoint> points =
        List.of(
            new DataPoint(Instant.now(), null), new DataPoint(Instant.now().plusSeconds(60), null));
    TrendResult result = MeteoMath.calculateTrend(points);
    assertThat(result.direction()).isEqualTo(TrendDirection.STABLE);
  }

  @Test
  void trend_clearUpwardTrend_returnsUp() {
    Instant base = Instant.parse("2026-06-16T10:00:00Z");
    List<DataPoint> points =
        List.of(
            new DataPoint(base, 10.0),
            new DataPoint(base.plusSeconds(600), 15.0),
            new DataPoint(base.plusSeconds(1200), 20.0),
            new DataPoint(base.plusSeconds(1800), 25.0),
            new DataPoint(base.plusSeconds(2400), 30.0));
    TrendResult result = MeteoMath.calculateTrend(points);
    assertThat(result.direction()).isEqualTo(TrendDirection.UP);
    assertThat(result.changeValue()).isGreaterThan(0.0);
  }

  @Test
  void trend_clearDownwardTrend_returnsDown() {
    Instant base = Instant.parse("2026-06-16T10:00:00Z");
    List<DataPoint> points =
        List.of(
            new DataPoint(base, 30.0),
            new DataPoint(base.plusSeconds(600), 25.0),
            new DataPoint(base.plusSeconds(1200), 20.0),
            new DataPoint(base.plusSeconds(1800), 15.0),
            new DataPoint(base.plusSeconds(2400), 10.0));
    TrendResult result = MeteoMath.calculateTrend(points);
    assertThat(result.direction()).isEqualTo(TrendDirection.DOWN);
    assertThat(result.changeValue()).isLessThan(0.0);
  }

  @Test
  void trend_negligibleChange_returnsStable() {
    Instant base = Instant.parse("2026-06-16T10:00:00Z");
    List<DataPoint> points =
        List.of(
            new DataPoint(base, 20.0),
            new DataPoint(base.plusSeconds(600), 20.05),
            new DataPoint(base.plusSeconds(1200), 19.95),
            new DataPoint(base.plusSeconds(1800), 20.02));
    TrendResult result = MeteoMath.calculateTrend(points);
    assertThat(result.direction()).isEqualTo(TrendDirection.STABLE);
    assertThat(result.changeValue()).isEqualTo(0.0);
  }

  // ---- rawToWetnessPct ----

  @Test
  void rawToWetnessPct_atWetBaseline_returns100() {
    // wet=400, dry=800; raw=400 → fully wet → 100%
    double result = MeteoMath.rawToWetnessPct(400, 800, 400);
    assertThat(result).isEqualTo(100.0);
  }

  @Test
  void rawToWetnessPct_atDryBaseline_returns0() {
    double result = MeteoMath.rawToWetnessPct(800, 800, 400);
    assertThat(result).isEqualTo(0.0);
  }

  @Test
  void rawToWetnessPct_halfway_returns50() {
    double result = MeteoMath.rawToWetnessPct(600, 800, 400);
    assertThat(result).isEqualTo(50.0);
  }

  @Test
  void rawToWetnessPct_belowWetBaseline_clamps100() {
    double result = MeteoMath.rawToWetnessPct(200, 800, 400);
    assertThat(result).isEqualTo(100.0);
  }

  @Test
  void rawToWetnessPct_aboveDryBaseline_clamps0() {
    double result = MeteoMath.rawToWetnessPct(1000, 800, 400);
    assertThat(result).isEqualTo(0.0);
  }
}
