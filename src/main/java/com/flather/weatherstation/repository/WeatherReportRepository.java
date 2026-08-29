package com.flather.weatherstation.repository;

import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.dto.analytics.DataGap;
import com.flather.weatherstation.dto.analytics.QualityBucket;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.dto.projection.ExtremesProjection;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface WeatherReportRepository extends JpaRepository<WeatherRecord, Long> {

  Optional<WeatherRecord> findFirstByMeasuredAtBetweenOrderByMeasuredAtDesc(
      Instant start, Instant end);

  @Query(
      value =
          """
                      SELECT
                          MIN(temperature) AS minTemp,
                          MAX(temperature) AS maxTemp
                      FROM weather_records
                      WHERE temperature_data_quality = 'OK'
                        AND measured_at >= :startTime
                        AND measured_at < :endTime
  """,
      nativeQuery = true)
  ExtremesProjection temperatureExtremes(
      @Param("startTime") Instant startTime, @Param("endTime") Instant endTime);

  @Query(
      value =
          """
                  SELECT COUNT(*)
                  FROM weather_records
                  WHERE
                    measured_at >= :startTime
                    AND measured_at < :endTime
                  """,
      nativeQuery = true)
  long countRecordsBetween(
      @Param("startTime") Instant startTime, @Param("endTime") Instant endTime);

  List<WeatherRecord> findByMeasuredAtAfterOrderByMeasuredAtAsc(Instant after);

  @Query(
      value =
          """
                  SELECT
                      date_bin(CAST(:bucketInterval AS interval), measured_at, :from) AS bucket,
                      ROUND(AVG(temperature)::numeric, 1)::double precision AS value
                  FROM weather_records
                  WHERE temperature_data_quality = 'OK'
                    AND measured_at >= :from
                    AND measured_at < :to
                  GROUP BY bucket
                  ORDER BY bucket ASC
                  """,
      nativeQuery = true)
  List<DataPoint> findChartTemperature(
      @Param("from") Instant from,
      @Param("to") Instant to,
      @Param("bucketInterval") String bucketInterval);

  @Query(
      value =
          """
                  SELECT
                      date_bin(CAST(:bucketInterval AS interval), measured_at, :from) AS bucket,
                      ROUND(AVG(humidity)::numeric, 1)::double precision AS value
                  FROM weather_records
                  WHERE humidity_data_quality = 'OK'
                    AND measured_at >= :from
                    AND measured_at < :to
                  GROUP BY bucket
                  ORDER BY bucket ASC
                  """,
      nativeQuery = true)
  List<DataPoint> findChartHumidity(
      @Param("from") Instant from,
      @Param("to") Instant to,
      @Param("bucketInterval") String bucketInterval);

  /**
   * Bucketed per-metric data-quality counts over [from, to), gap-filled so every bucket is present.
   *
   * <p>{@code from} must be bucket-aligned and {@code to} must be {@code from + n * bucketInterval}
   * — the caller anchors the window so that the final bucket contains "now", otherwise the strip
   * would end in the past. The same {@code from} is used as the {@code date_bin} origin, which is
   * what keeps the aggregated buckets aligned with the generated ones for the equality join.
   *
   * <p>Empty buckets are real signal, not noise: an offline sensor writes no rows at all, so a gap
   * only ever shows up as a bucket with {@code totalCount = 0}.
   *
   * <p>{@link QualityBucket} is bound positionally, so the outer SELECT list must stay in the same
   * order as that record's components — a reordered column silently swaps counts rather than
   * failing.
   */
  @Query(
      value =
          """
                  WITH buckets AS (
                      SELECT bucket_from
                      FROM generate_series(
                          CAST(:from AS timestamptz),
                          CAST(:to AS timestamptz) - CAST(:bucketInterval AS interval),
                          CAST(:bucketInterval AS interval)
                      ) AS bucket_from
                  ),
                  agg AS (
                      SELECT
                          date_bin(CAST(:bucketInterval AS interval), measured_at, CAST(:from AS timestamptz)) AS bucket_from,
                          COUNT(*)::int AS total,
                          COUNT(*) FILTER (WHERE temperature_data_quality     = 'OK')::int             AS temp_ok,
                          COUNT(*) FILTER (WHERE temperature_data_quality     = 'SPIKE')::int          AS temp_spike,
                          COUNT(*) FILTER (WHERE temperature_data_quality     = 'ANOMALY')::int        AS temp_anomaly,
                          COUNT(*) FILTER (WHERE temperature_data_quality     = 'MISSING')::int        AS temp_missing,
                          COUNT(*) FILTER (WHERE temperature_data_quality     = 'NOT_CONFIGURED')::int AS temp_notcfg,
                          COUNT(*) FILTER (WHERE pressure_data_quality        = 'OK')::int             AS press_ok,
                          COUNT(*) FILTER (WHERE pressure_data_quality        = 'SPIKE')::int          AS press_spike,
                          COUNT(*) FILTER (WHERE pressure_data_quality        = 'ANOMALY')::int        AS press_anomaly,
                          COUNT(*) FILTER (WHERE pressure_data_quality        = 'MISSING')::int        AS press_missing,
                          COUNT(*) FILTER (WHERE pressure_data_quality        = 'NOT_CONFIGURED')::int AS press_notcfg,
                          COUNT(*) FILTER (WHERE humidity_data_quality        = 'OK')::int             AS hum_ok,
                          COUNT(*) FILTER (WHERE humidity_data_quality        = 'SPIKE')::int          AS hum_spike,
                          COUNT(*) FILTER (WHERE humidity_data_quality        = 'ANOMALY')::int        AS hum_anomaly,
                          COUNT(*) FILTER (WHERE humidity_data_quality        = 'MISSING')::int        AS hum_missing,
                          COUNT(*) FILTER (WHERE humidity_data_quality        = 'NOT_CONFIGURED')::int AS hum_notcfg,
                          COUNT(*) FILTER (WHERE surface_wetness_data_quality = 'OK')::int             AS wet_ok,
                          COUNT(*) FILTER (WHERE surface_wetness_data_quality = 'ANOMALY')::int        AS wet_anomaly,
                          COUNT(*) FILTER (WHERE surface_wetness_data_quality = 'MISSING')::int        AS wet_missing,
                          COUNT(*) FILTER (WHERE surface_wetness_data_quality = 'NOT_CONFIGURED')::int AS wet_notcfg,
                          COUNT(*) FILTER (WHERE wind_data_quality            = 'OK')::int             AS wind_ok,
                          COUNT(*) FILTER (WHERE wind_data_quality            = 'SPIKE')::int          AS wind_spike,
                          COUNT(*) FILTER (WHERE wind_data_quality            = 'ANOMALY')::int        AS wind_anomaly,
                          COUNT(*) FILTER (WHERE wind_data_quality            = 'MISSING')::int        AS wind_missing,
                          COUNT(*) FILTER (WHERE wind_data_quality            = 'NOT_CONFIGURED')::int AS wind_notcfg,
                          COUNT(*) FILTER (WHERE wind_direction_data_quality  = 'OK')::int             AS wdir_ok,
                          COUNT(*) FILTER (WHERE wind_direction_data_quality  = 'ANOMALY')::int        AS wdir_anomaly,
                          COUNT(*) FILTER (WHERE wind_direction_data_quality  = 'MISSING')::int        AS wdir_missing,
                          COUNT(*) FILTER (WHERE wind_direction_data_quality  = 'NOT_CONFIGURED')::int AS wdir_notcfg,
                          COUNT(*) FILTER (WHERE uv_index_data_quality        = 'OK')::int             AS uv_ok,
                          COUNT(*) FILTER (WHERE uv_index_data_quality        = 'SPIKE')::int          AS uv_spike,
                          COUNT(*) FILTER (WHERE uv_index_data_quality        = 'ANOMALY')::int        AS uv_anomaly,
                          COUNT(*) FILTER (WHERE uv_index_data_quality        = 'MISSING')::int        AS uv_missing,
                          COUNT(*) FILTER (WHERE uv_index_data_quality        = 'NOT_CONFIGURED')::int AS uv_notcfg
                      FROM weather_records
                      WHERE measured_at >= :from
                        AND measured_at <  :to
                      GROUP BY 1
                  )
                  SELECT
                      b.bucket_from                    AS bucket_from,
                      COALESCE(a.total,         0)     AS total,
                      COALESCE(a.temp_ok,       0) AS temp_ok,
                      COALESCE(a.temp_spike,    0) AS temp_spike,
                      COALESCE(a.temp_anomaly,  0) AS temp_anomaly,
                      COALESCE(a.temp_missing,  0) AS temp_missing,
                      COALESCE(a.temp_notcfg,   0) AS temp_notcfg,
                      COALESCE(a.press_ok,      0) AS press_ok,
                      COALESCE(a.press_spike,   0) AS press_spike,
                      COALESCE(a.press_anomaly, 0) AS press_anomaly,
                      COALESCE(a.press_missing, 0) AS press_missing,
                      COALESCE(a.press_notcfg,  0) AS press_notcfg,
                      COALESCE(a.hum_ok,        0) AS hum_ok,
                      COALESCE(a.hum_spike,     0) AS hum_spike,
                      COALESCE(a.hum_anomaly,   0) AS hum_anomaly,
                      COALESCE(a.hum_missing,   0) AS hum_missing,
                      COALESCE(a.hum_notcfg,    0) AS hum_notcfg,
                      COALESCE(a.wet_ok,        0) AS wet_ok,
                      COALESCE(a.wet_anomaly,   0) AS wet_anomaly,
                      COALESCE(a.wet_missing,   0) AS wet_missing,
                      COALESCE(a.wet_notcfg,    0) AS wet_notcfg,
                      COALESCE(a.wind_ok,       0) AS wind_ok,
                      COALESCE(a.wind_spike,    0) AS wind_spike,
                      COALESCE(a.wind_anomaly,  0) AS wind_anomaly,
                      COALESCE(a.wind_missing,  0) AS wind_missing,
                      COALESCE(a.wind_notcfg,   0) AS wind_notcfg,
                      COALESCE(a.wdir_ok,       0) AS wdir_ok,
                      COALESCE(a.wdir_anomaly,  0) AS wdir_anomaly,
                      COALESCE(a.wdir_missing,  0) AS wdir_missing,
                      COALESCE(a.wdir_notcfg,   0) AS wdir_notcfg,
                      COALESCE(a.uv_ok,         0) AS uv_ok,
                      COALESCE(a.uv_spike,      0) AS uv_spike,
                      COALESCE(a.uv_anomaly,    0) AS uv_anomaly,
                      COALESCE(a.uv_missing,    0) AS uv_missing,
                      COALESCE(a.uv_notcfg,     0) AS uv_notcfg
                  FROM buckets b
                  LEFT JOIN agg a ON a.bucket_from = b.bucket_from
                  ORDER BY b.bucket_from ASC
                  """,
      nativeQuery = true)
  List<QualityBucket> findQualityBuckets(
      @Param("from") Instant from,
      @Param("to") Instant to,
      @Param("bucketInterval") String bucketInterval);

  /**
   * The longest stretch of [from, until] with no record written, as a {@link DataGap}.
   *
   * <p>{@code until} must be "now", not the strip's window end — the strip's end is the end of the
   * still-running final bucket and therefore in the future, which would report a phantom trailing
   * gap of up to one bucket on a perfectly healthy station.
   *
   * <p>Both window edges are unioned in as sentinel timestamps so that {@code LAG} also measures
   * the leading gap (silent since before the window opened) and the trailing gap (died and never
   * came back) — the latter being the most urgent case and the one a plain row-to-row scan misses,
   * since there is no later reading to bound it. With no rows at all, the sentinels alone pair up
   * and the whole window is correctly reported as one gap.
   *
   * <p>{@code minGapMinutes} is what separates an outage from the ordinary interval between two
   * readings: every consecutive pair is technically a gap, so without a floor a healthy station
   * returns ~1440 one-minute "gaps". The caller derives it from the observed reporting cadence
   * rather than hardcoding, because a station reading every 30 minutes would otherwise have every
   * normal interval flagged.
   *
   * <p>Ordered by start time so the result can be laid over the strip positionally. The LIMIT is a
   * safety valve against a badly flapping connection, not an expected bound.
   */
  @Query(
      value =
          """
                  WITH edges AS (
                      SELECT CAST(:from AS timestamptz) AS ts
                      UNION ALL
                      SELECT measured_at
                      FROM weather_records
                      WHERE measured_at >= :from
                        AND measured_at <  :until
                      UNION ALL
                      SELECT CAST(:until AS timestamptz)
                  ),
                  spans AS (
                      SELECT LAG(ts) OVER (ORDER BY ts) AS gap_start,
                             ts                         AS gap_end
                      FROM edges
                  )
                  SELECT
                      gap_start                                                AS gap_start,
                      gap_end                                                  AS gap_end,
                      (EXTRACT(EPOCH FROM (gap_end - gap_start)) / 60)::bigint AS gap_minutes
                  FROM spans
                  WHERE gap_start IS NOT NULL
                    AND EXTRACT(EPOCH FROM (gap_end - gap_start))
                          >= CAST(:minGapMinutes AS double precision) * 60
                  ORDER BY gap_start
                  LIMIT 200
                  """,
      nativeQuery = true)
  List<DataGap> findGaps(
      @Param("from") Instant from,
      @Param("until") Instant until,
      @Param("minGapMinutes") int minGapMinutes);

  Optional<WeatherRecord> findFirstByOrderByMeasuredAtDesc();

  @Query(
      value =
          """
                  SELECT
                      date_bin(CAST(:bucketInterval AS interval), measured_at, :from) AS bucket,
                      ROUND(AVG(pressure)::numeric, 1)::double precision AS value
                  FROM weather_records
                  WHERE pressure_data_quality = 'OK'
                    AND measured_at >= :from
                    AND measured_at < :to
                  GROUP BY bucket
                  ORDER BY bucket ASC
                  """,
      nativeQuery = true)
  List<DataPoint> findChartPressure(
      @Param("from") Instant from,
      @Param("to") Instant to,
      @Param("bucketInterval") String bucketInterval);

  @Query(
      value =
          """
                  SELECT
                      date_bin(CAST(:bucketInterval AS interval), measured_at, :from) AS bucket,
                      ROUND(AVG(wind)::numeric, 1)::double precision AS value
                  FROM weather_records
                  WHERE wind_data_quality = 'OK'
                    AND measured_at >= :from
                    AND measured_at < :to
                  GROUP BY bucket
                  ORDER BY bucket ASC
                  """,
      nativeQuery = true)
  List<DataPoint> findChartWind(
      @Param("from") Instant from,
      @Param("to") Instant to,
      @Param("bucketInterval") String bucketInterval);

  @Query(
      value =
          """
                  SELECT
                      date_bin(CAST(:bucketInterval AS interval), measured_at, :from) AS bucket,
                      ROUND(AVG(uv_index)::numeric, 1)::double precision AS value
                  FROM weather_records
                  WHERE uv_index_data_quality = 'OK'
                    AND measured_at >= :from
                    AND measured_at < :to
                  GROUP BY bucket
                  ORDER BY bucket ASC
                  """,
      nativeQuery = true)
  List<DataPoint> findChartUvIndex(
      @Param("from") Instant from,
      @Param("to") Instant to,
      @Param("bucketInterval") String bucketInterval);
}
