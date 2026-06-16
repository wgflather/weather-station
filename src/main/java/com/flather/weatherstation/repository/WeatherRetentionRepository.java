package com.flather.weatherstation.repository;

import com.flather.weatherstation.domain.entity.WeatherRecord;
import java.time.Instant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
public interface WeatherRetentionRepository extends JpaRepository<WeatherRecord, Long> {

  @Modifying
  @Transactional
  @Query(
      value =
          """
          INSERT INTO hourly_weather_record (
              device_id,
              temperature_avg, pressure_avg, humidity_avg, surface_wetness_avg,
              hour
          )
          SELECT
              device_id,
              AVG(CASE WHEN temperature_data_quality    = 'OK' THEN temperature    END),
              AVG(CASE WHEN pressure_data_quality       = 'OK' THEN pressure       END),
              AVG(CASE WHEN humidity_data_quality       = 'OK' THEN humidity       END),
              AVG(CASE WHEN surface_wetness_data_quality = 'OK' THEN surface_wetness END),
              date_trunc('hour', measured_at)
          FROM weather_records
          WHERE date_trunc('hour', measured_at) < date_trunc('hour', NOW())
            AND measured_at >= NOW() - INTERVAL '2 days'
          GROUP BY device_id, date_trunc('hour', measured_at)
          ON CONFLICT (device_id, hour) DO NOTHING
          """,
      nativeQuery = true)
  int rollupHourly();

  @Modifying
  @Transactional
  @Query(
      value =
"""
          INSERT INTO daily_weather_record (
              device_id,
              temperature_min, temperature_max, temperature_avg,
              pressure_min,    pressure_max,    pressure_avg,
              humidity_min,    humidity_max,    humidity_avg,
              surface_wetness_min, surface_wetness_max, surface_wetness_avg,
              date
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
              day_bucket
          FROM (
              SELECT *,
                     (date_trunc('day', measured_at AT TIME ZONE :timezone))::date AS day_bucket
              FROM weather_records
              WHERE measured_at >= NOW() - INTERVAL '2 days'
          ) sub
          WHERE day_bucket < (date_trunc('day', NOW() AT TIME ZONE :timezone))::date
          GROUP BY device_id, day_bucket
          ON CONFLICT (device_id, date) DO NOTHING
""",
      nativeQuery = true)
  int rollupDaily(@Param("timezone") String timezone);

  @Modifying(clearAutomatically = true)
  @Transactional
  @Query(value = "DELETE FROM weather_records WHERE measured_at < :cutoff", nativeQuery = true)
  int deleteRawOlderThan(@Param("cutoff") Instant cutoff);
}
