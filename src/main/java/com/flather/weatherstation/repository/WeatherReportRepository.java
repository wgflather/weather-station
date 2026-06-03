package com.flather.weatherstation.repository;

import com.flather.weatherstation.dto.analytics.PressureDto;
import com.flather.weatherstation.dto.analytics.TemperatureDto;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.dto.projection.ExtremesProjection;
import com.flather.weatherstation.model.entity.WeatherRecord;
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
                      ROUND(AVG(pressure)::numeric, 1)::double precision
                  FROM weather_records
                  WHERE data_quality = 'OK'
                    AND measured_at >= (
                      SELECT MAX(measured_at) FROM weather_records WHERE data_quality = 'OK'
                  ) - INTERVAL '5 minutes'
                  """,
      nativeQuery = true)
  PressureDto getPressure();

  @Query(
      value =
          """
                  WITH latest AS (
                      SELECT MAX(measured_at) AS latest_time
                      FROM weather_records
                      WHERE data_quality = 'OK'
                  ),
                  average AS (
                      SELECT
                          ROUND(AVG(wr.temperature)::numeric, 1)::double precision AS avgTemperature
                      FROM weather_records wr
                      CROSS JOIN latest l
                      WHERE wr.data_quality = 'OK'
                        AND wr.measured_at >= l.latest_time - INTERVAL '5 minutes'
                  ),
                  minMax AS (
                      SELECT
                          MIN(temperature) AS minTemp,
                          MAX(temperature) AS maxTemp
                      FROM weather_records
                      WHERE data_quality = 'OK'
                        AND measured_at >= :startTime
                        AND measured_at < :endTime
                  )
                  SELECT
                      average.avgTemperature,
                      minMax.minTemp,
                      minMax.maxTemp
                  FROM minMax
                  CROSS JOIN average;
                  """,
      nativeQuery = true)
  TemperatureDto getTemperature(
      @Param("startTime") Instant startTime, @Param("endTime") Instant endTime);

  @Query(
      value =
          """
                      SELECT
                          MIN(temperature) AS minTemp,
                          MAX(temperature) AS maxTemp
                      FROM weather_records
                      WHERE data_quality = 'OK'
                        AND measured_at >= :startTime
                        AND measured_at < :endTime
  """,
      nativeQuery = true)
  ExtremesProjection temperatureExtremes(
      @Param("startTime") Instant startTime, @Param("endTime") Instant endTime);

  @Query(
      value =
          """
                  SELECT
                      date_bin('5 minutes', measured_at, current_date) AS time,
                      ROUND(AVG(temperature)::numeric, 1)::double precision AS value
                  FROM weather_records
                  WHERE data_quality = 'OK'
                    AND measured_at >= NOW() - interval '1 hour'
                  GROUP BY time
                  ORDER BY time ASC
                  """,
      nativeQuery = true)
  List<DataPoint> getLastHourTemperature();

  @Query(
      value =
          """
                  SELECT COUNT(*)
                  FROM weather_records
                  WHERE data_quality = 'OK'
                    AND measured_at >= :startTime
                    AND measured_at < :endTime
                  """,
      nativeQuery = true)
  long findRecordsBetween(@Param("startTime") Instant startTime, @Param("endTime") Instant endTime);

  List<WeatherRecord> findByMeasuredAtAfterOrderByMeasuredAtAsc(Instant after);

  @Query(
      value =
          """
                  SELECT
                      date_bin('10 minutes', measured_at, :since) AS bucket,
                      ROUND(AVG(temperature)::numeric, 1)::double precision AS value
                  FROM weather_records
                  WHERE data_quality = 'OK'
                    AND measured_at >= :since
                  GROUP BY bucket
                  ORDER BY bucket ASC
                  """,
      nativeQuery = true)
  List<DataPoint> findChartTemperature(@Param("since") Instant since);

  @Query(
      value =
          """
                  SELECT
                      date_bin('10 minutes', measured_at, :since) AS bucket,
                      ROUND(AVG(pressure)::numeric, 1)::double precision AS value
                  FROM weather_records
                  WHERE data_quality = 'OK'
                    AND measured_at >= :since
                  GROUP BY bucket
                  ORDER BY bucket ASC
                  """,
      nativeQuery = true)
  List<DataPoint> findChartPressure(@Param("since") Instant since);

  @Query(
      value =
          """
                  SELECT
                      date_bin('5 minutes', measured_at, current_date) AS time,
                      ROUND(AVG(pressure)::numeric, 1)::double precision AS value
                  FROM weather_records
                  WHERE data_quality = 'OK'
                    AND measured_at >= NOW() - interval '1 hour'
                  GROUP BY time
                  ORDER BY time ASC
                  """,
      nativeQuery = true)
  List<DataPoint> getLastHourPressure();
}
