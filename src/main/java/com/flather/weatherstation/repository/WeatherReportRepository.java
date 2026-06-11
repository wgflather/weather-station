package com.flather.weatherstation.repository;

import com.flather.weatherstation.domain.entity.WeatherRecord;
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
                        AND pressure_data_quality = 'OK'
                        AND humidity_data_quality = 'OK'
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
  long findRecordsBetween(@Param("startTime") Instant startTime, @Param("endTime") Instant endTime);

  List<WeatherRecord> findByMeasuredAtAfterOrderByMeasuredAtAsc(Instant after);

  @Query(
      value =
          """
                  SELECT
                      date_bin(CAST(:bucketInterval AS interval), measured_at, :since) AS bucket,
                      ROUND(AVG(temperature)::numeric, 1)::double precision AS value
                  FROM weather_records
                  WHERE temperature_data_quality = 'OK'
                    AND measured_at >= :since
                  GROUP BY bucket
                  ORDER BY bucket ASC
                  """,
      nativeQuery = true)
  List<DataPoint> findChartTemperature(
      @Param("since") Instant since, @Param("bucketInterval") String bucketInterval);

  @Query(
      value =
          """
                          SELECT
                              date_bin(CAST(:bucketInterval AS interval), measured_at, :since) AS bucket,
                              ROUND(AVG(humidity)::numeric, 1)::double precision AS value
                          FROM weather_records
                          WHERE humidity_data_quality = 'OK'
                           AND measured_at >= :since
                          GROUP BY bucket
                          ORDER BY bucket ASC
                          """,
      nativeQuery = true)
  List<DataPoint> findChartHumidity(
      @Param("since") Instant since, @Param("bucketInterval") String bucketInterval);

  @Query(
      value =
          """
                  SELECT
                      date_bin(CAST(:bucketInterval AS interval), measured_at, :since) AS bucket,
                      ROUND(AVG(pressure)::numeric, 1)::double precision AS value
                  FROM weather_records
                  WHERE pressure_data_quality = 'OK'
                    AND measured_at >= :since
                  GROUP BY bucket
                  ORDER BY bucket ASC
                  """,
      nativeQuery = true)
  List<DataPoint> findChartPressure(
      @Param("since") Instant since, @Param("bucketInterval") String bucketInterval);
}
