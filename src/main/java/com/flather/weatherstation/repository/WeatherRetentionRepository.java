package com.flather.weatherstation.repository;

import com.flather.weatherstation.domain.entity.WeatherRecord;
import java.time.Instant;
import java.time.LocalDate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public interface WeatherRetentionRepository extends JpaRepository<WeatherRecord, Long> {

  /**
   * Rolls raw readings up into hourly buckets over the whole raw-retention window, not just the
   * last day or two. Every bucket is recomputed and upserted on each run, so the table self-heals:
   * a gap from downtime, a late-arriving reading, or a newly added column all get repaired on the
   * next pass instead of needing a one-off backfill. It stays one statement over an indexed range,
   * so widening the window costs almost nothing.
   *
   * <p>Wind direction is aggregated as a unit-vector mean rather than a plain average — averaging
   * bearings numerically puts an hour spent oscillating around north at 180°, due south. See V10
   * for the full reasoning and for what {@code wind_direction_consistency} is worth.
   */
  @Modifying
  @Transactional
  @Query(
      value =
          """
          WITH components AS (
              SELECT
                  device_id,
                  date_trunc('hour', measured_at) AS hour,
                  AVG(CASE WHEN temperature_data_quality     = 'OK' THEN temperature     END) AS temperature_avg,
                  AVG(CASE WHEN pressure_data_quality        = 'OK' THEN pressure        END) AS pressure_avg,
                  AVG(CASE WHEN humidity_data_quality        = 'OK' THEN humidity        END) AS humidity_avg,
                  AVG(CASE WHEN surface_wetness_data_quality = 'OK' THEN surface_wetness END) AS surface_wetness_avg,
                  AVG(CASE WHEN uv_index_data_quality        = 'OK' THEN uv_index        END) AS uv_index_avg,
                  AVG(CASE WHEN wind_data_quality            = 'OK' THEN wind            END) AS wind_speed_avg,
                  MAX(CASE WHEN wind_data_quality            = 'OK' THEN wind            END) AS wind_speed_max,
                  AVG(CASE WHEN wind_direction_data_quality = 'OK'
                            AND wind_data_quality = 'OK'
                            AND wind > :calmThreshold
                           THEN sin(radians(wind_direction)) END) AS sin_mean,
                  AVG(CASE WHEN wind_direction_data_quality = 'OK'
                            AND wind_data_quality = 'OK'
                            AND wind > :calmThreshold
                           THEN cos(radians(wind_direction)) END) AS cos_mean
              FROM weather_records
              WHERE measured_at >= :from
                AND date_trunc('hour', measured_at) < date_trunc('hour', NOW())
              GROUP BY device_id, date_trunc('hour', measured_at)
          ),
          vector AS (
              SELECT *,
                     sqrt(sin_mean * sin_mean + cos_mean * cos_mean) AS consistency,
                     degrees(atan2(sin_mean, cos_mean))              AS bearing_signed
              FROM components
          ),
          bearing AS (
              SELECT *,
                     CASE WHEN bearing_signed < 0 THEN bearing_signed + 360 ELSE bearing_signed END AS bearing
              FROM vector
          )
          INSERT INTO hourly_weather_record (
              device_id,
              temperature_avg, pressure_avg, humidity_avg, surface_wetness_avg,
              uv_index_avg, wind_speed_avg, wind_speed_max,
              wind_direction_avg, wind_direction_consistency,
              hour
          )
          SELECT
              device_id,
              temperature_avg, pressure_avg, humidity_avg, surface_wetness_avg,
              uv_index_avg, wind_speed_avg, wind_speed_max,
              -- atan2(0, 0) is 0 in Postgres, so a bearing that cancels out entirely would be
              -- stored as a confident due north. The >= 360 arm keeps the value in [0, 360):
              -- a mean wrapping through north lands on -1e-14, which rounds to exactly 360.0.
              CASE WHEN consistency >= :minConsistency
                   THEN CASE WHEN bearing >= 360 THEN bearing - 360 ELSE bearing END
              END,
              consistency,
              hour
          FROM bearing
          ON CONFLICT (device_id, hour) DO UPDATE SET
              temperature_avg            = EXCLUDED.temperature_avg,
              pressure_avg               = EXCLUDED.pressure_avg,
              humidity_avg               = EXCLUDED.humidity_avg,
              surface_wetness_avg        = EXCLUDED.surface_wetness_avg,
              uv_index_avg               = EXCLUDED.uv_index_avg,
              wind_speed_avg             = EXCLUDED.wind_speed_avg,
              wind_speed_max             = EXCLUDED.wind_speed_max,
              wind_direction_avg         = EXCLUDED.wind_direction_avg,
              wind_direction_consistency = EXCLUDED.wind_direction_consistency
          """,
      nativeQuery = true)
  int rollupHourly(
      @Param("from") Instant from,
      @Param("calmThreshold") double calmThreshold,
      @Param("minConsistency") double minConsistency);

  /**
   * Writes one daily row for a single (date, period) pair. The caller supplies the window as
   * instants, which keeps the local-day and sunrise/sunset boundaries — both of which are resolved
   * in Java — out of the SQL entirely.
   *
   * <p>Every period is one contiguous half-open range, night included: it runs from the previous
   * day's sunset to this day's sunrise rather than being split around midnight, so it needs no
   * second range and crosses the date boundary freely.
   *
   * <p>A date with no raw rows in the window aggregates to nothing and is skipped by the INSERT,
   * which is what keeps rows older than the raw-retention window from being overwritten with nulls.
   */
  @Modifying
  @Transactional
  @Query(
      value =
          """
          INSERT INTO daily_weather_record (
              device_id,
              temperature_min,     temperature_max,     temperature_avg,
              pressure_min,        pressure_max,        pressure_avg,
              humidity_min,        humidity_max,        humidity_avg,
              surface_wetness_min, surface_wetness_max, surface_wetness_avg,
              uv_index_max,        uv_index_avg,
              wind_speed_min,      wind_speed_max,      wind_speed_avg,
              date, period
          )
          SELECT
              device_id,
              MIN(CASE WHEN temperature_data_quality     = 'OK' THEN temperature     END),
              MAX(CASE WHEN temperature_data_quality     = 'OK' THEN temperature     END),
              AVG(CASE WHEN temperature_data_quality     = 'OK' THEN temperature     END),
              MIN(CASE WHEN pressure_data_quality        = 'OK' THEN pressure        END),
              MAX(CASE WHEN pressure_data_quality        = 'OK' THEN pressure        END),
              AVG(CASE WHEN pressure_data_quality        = 'OK' THEN pressure        END),
              MIN(CASE WHEN humidity_data_quality        = 'OK' THEN humidity        END),
              MAX(CASE WHEN humidity_data_quality        = 'OK' THEN humidity        END),
              AVG(CASE WHEN humidity_data_quality        = 'OK' THEN humidity        END),
              MIN(CASE WHEN surface_wetness_data_quality = 'OK' THEN surface_wetness END),
              MAX(CASE WHEN surface_wetness_data_quality = 'OK' THEN surface_wetness END),
              AVG(CASE WHEN surface_wetness_data_quality = 'OK' THEN surface_wetness END),
              MAX(CASE WHEN uv_index_data_quality        = 'OK' THEN uv_index        END),
              AVG(CASE WHEN uv_index_data_quality        = 'OK' THEN uv_index        END),
              MIN(CASE WHEN wind_data_quality            = 'OK' THEN wind            END),
              MAX(CASE WHEN wind_data_quality            = 'OK' THEN wind            END),
              AVG(CASE WHEN wind_data_quality            = 'OK' THEN wind            END),
              CAST(:date AS DATE),
              CAST(:period AS VARCHAR)
          FROM weather_records
          WHERE (measured_at >= :from  AND measured_at < :to)
          GROUP BY device_id
          ON CONFLICT (device_id, date, period) DO UPDATE SET
              temperature_min     = EXCLUDED.temperature_min,
              temperature_max     = EXCLUDED.temperature_max,
              temperature_avg     = EXCLUDED.temperature_avg,
              pressure_min        = EXCLUDED.pressure_min,
              pressure_max        = EXCLUDED.pressure_max,
              pressure_avg        = EXCLUDED.pressure_avg,
              humidity_min        = EXCLUDED.humidity_min,
              humidity_max        = EXCLUDED.humidity_max,
              humidity_avg        = EXCLUDED.humidity_avg,
              surface_wetness_min = EXCLUDED.surface_wetness_min,
              surface_wetness_max = EXCLUDED.surface_wetness_max,
              surface_wetness_avg = EXCLUDED.surface_wetness_avg,
              uv_index_max        = EXCLUDED.uv_index_max,
              uv_index_avg        = EXCLUDED.uv_index_avg,
              wind_speed_min      = EXCLUDED.wind_speed_min,
              wind_speed_max      = EXCLUDED.wind_speed_max,
              wind_speed_avg      = EXCLUDED.wind_speed_avg
          """,
      nativeQuery = true)
  int rollupDailyPeriod(
      @Param("date") LocalDate date,
      @Param("period") String period,
      @Param("from") Instant from,
      @Param("to") Instant to);

  @Modifying(clearAutomatically = true)
  @Transactional
  @Query(value = "DELETE FROM weather_records WHERE measured_at < :cutoff", nativeQuery = true)
  int deleteRawOlderThan(@Param("cutoff") Instant cutoff);
}
