package com.flather.weatherstation.repository;

import com.flather.weatherstation.dto.analytics.PressureDto;
import com.flather.weatherstation.dto.analytics.TemperatureDto;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.dto.projection.ExtremesProjection;
import com.flather.weatherstation.domain.entity.WeatherRecord;
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
                              ROUND(AVG(humidity)::numeric, 1)::double precision AS value
                          FROM weather_records
                          WHERE data_quality = 'OK'
                            AND measured_at >= :since
                          GROUP BY bucket
                          ORDER BY bucket ASC
                          """,
          nativeQuery = true)
  List<DataPoint> findChartHumidity(@Param("since") Instant since);

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

}
