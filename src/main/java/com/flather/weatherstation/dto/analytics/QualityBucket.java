package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.Metric;
import java.time.Instant;

/**
 * Counts of readings by quality, per metric, inside one bucket of a {@link QualityStrip}.
 *
 * <p>The bucket end is not carried here — buckets are contiguous and fixed-width, so it is always
 * {@code from + QualityStrip.bucketMinutes}.
 *
 * <p>{@code totalCount} is a <em>record</em> count, shared by every metric in the bucket. A row
 * whose temperature failed still counts toward it, so it answers "did the station report?" rather
 * than "was this metric healthy?". Per-metric health comes from the four counts below it.
 *
 * <p>The per-metric counts do not necessarily sum to {@code totalCount}: the quality columns are
 * nullable, so a row written outside {@code DataQualityValidator} contributes to {@code totalCount}
 * while being counted in none of the states. Never derive {@code ok} by subtraction.
 *
 * <p>{@code notConfigured} counts rows where the station omitted the field entirely. It is a
 * statement about the hardware, not the reading, so it is kept out of the health counts.
 *
 * <p>Surface wetness and wind direction have no spike counts by design — {@code
 * DataQualityValidator.getSpikeLimit} only defines limits for temperature, pressure, humidity, wind
 * and UV index, so those two metrics can never be flagged {@code SPIKE}. Both still produce {@code
 * ANOMALY} and {@code MISSING}.
 *
 * <p>Component order is load-bearing: this record is bound positionally from a native query, so the
 * SELECT list of {@code WeatherReportRepository.findQualityBuckets} must match it exactly. Metrics
 * are ordered as in {@code Metric} and {@code WeatherRecord}.
 */
public record QualityBucket(
    Instant from,
    int totalCount,
    int tempOkCount,
    int tempSpikeCount,
    int tempAnomalyCount,
    int tempMissingCount,
    int tempNotConfiguredCount,
    int pressureOkCount,
    int pressureSpikeCount,
    int pressureAnomalyCount,
    int pressureMissingCount,
    int pressureNotConfiguredCount,
    int humidityOkCount,
    int humiditySpikeCount,
    int humidityAnomalyCount,
    int humidityMissingCount,
    int humidityNotConfiguredCount,
    int surfaceWetnessOkCount,
    int surfaceWetnessAnomalyCount,
    int surfaceWetnessMissingCount,
    int surfaceWetnessNotConfiguredCount,
    int windOkCount,
    int windSpikeCount,
    int windAnomalyCount,
    int windMissingCount,
    int windNotConfiguredCount,
    int windDirectionOkCount,
    int windDirectionAnomalyCount,
    int windDirectionMissingCount,
    int windDirectionNotConfiguredCount,
    int uvIndexOkCount,
    int uvIndexSpikeCount,
    int uvIndexAnomalyCount,
    int uvIndexMissingCount,
    int uvIndexNotConfiguredCount) {

  public MetricQualityCounts qualityFor(Metric metric) {
    return switch (metric) {
      case TEMPERATURE ->
          new MetricQualityCounts(
              tempOkCount,
              tempSpikeCount,
              tempAnomalyCount,
              tempMissingCount,
              tempNotConfiguredCount);

      case PRESSURE ->
          new MetricQualityCounts(
              pressureOkCount,
              pressureSpikeCount,
              pressureAnomalyCount,
              pressureMissingCount,
              pressureNotConfiguredCount);

      case HUMIDITY ->
          new MetricQualityCounts(
              humidityOkCount,
              humiditySpikeCount,
              humidityAnomalyCount,
              humidityMissingCount,
              humidityNotConfiguredCount);

      case SURFACE_WETNESS ->
          new MetricQualityCounts(
              surfaceWetnessOkCount,
              0,
              surfaceWetnessAnomalyCount,
              surfaceWetnessMissingCount,
              surfaceWetnessNotConfiguredCount);

      case WIND ->
          new MetricQualityCounts(
              windOkCount,
              windSpikeCount,
              windAnomalyCount,
              windMissingCount,
              windNotConfiguredCount);

      case WIND_DIRECTION ->
          new MetricQualityCounts(
              windDirectionOkCount,
              0,
              windDirectionAnomalyCount,
              windDirectionMissingCount,
              windDirectionNotConfiguredCount);

      case UV_INDEX ->
          new MetricQualityCounts(
              uvIndexOkCount,
              uvIndexSpikeCount,
              uvIndexAnomalyCount,
              uvIndexMissingCount,
              uvIndexNotConfiguredCount);
    };
  }
}
