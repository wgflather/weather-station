package com.flather.weatherstation.repository;

import com.flather.weatherstation.domain.entity.HourlyWeatherRecord;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.dto.projection.HourOfDayAverage;
import java.time.Instant;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface HourlyWeatherRecordRepository extends JpaRepository<HourlyWeatherRecord, Long> {

  List<HourlyWeatherRecord> findByHourBetweenOrderByHourAsc(Instant from, Instant to);

  @Query(
      value =
          """
          SELECT hour, temperature_avg AS value
          FROM hourly_weather_record
          WHERE hour >= :from AND hour < :to
          ORDER BY hour ASC
          """,
      nativeQuery = true)
  List<DataPoint> findChartTemperature(@Param("from") Instant from, @Param("to") Instant to);

  @Query(
      value =
          """
          SELECT hour, pressure_avg AS value
          FROM hourly_weather_record
          WHERE hour >= :from AND hour < :to
          ORDER BY hour ASC
          """,
      nativeQuery = true)
  List<DataPoint> findChartPressure(@Param("from") Instant from, @Param("to") Instant to);

  @Query(
      value =
          """
          SELECT hour, humidity_avg AS value
          FROM hourly_weather_record
          WHERE hour >= :from AND hour < :to
          ORDER BY hour ASC
          """,
      nativeQuery = true)
  List<DataPoint> findChartHumidity(@Param("from") Instant from, @Param("to") Instant to);

  @Query(
      value =
          """
                  SELECT hour, wind_speed_avg AS value
                  FROM hourly_weather_record
                  WHERE hour >= :from AND hour < :to
                  ORDER BY hour ASC
                  """,
      nativeQuery = true)
  List<DataPoint> findChartWindSpeed(@Param("from") Instant from, @Param("to") Instant to);

  @Query(
      value =
          """
                  SELECT hour, wind_direction_avg AS value
                  FROM hourly_weather_record
                  WHERE hour >= :from AND hour < :to
                  ORDER BY hour ASC
                  """,
      nativeQuery = true)
  List<DataPoint> findChartWindDirection(@Param("from") Instant from, @Param("to") Instant to);

  @Query(
      value =
          """
                  SELECT hour, uv_index_avg AS value
                  FROM hourly_weather_record
                  WHERE hour >= :from AND hour < :to
                  ORDER BY hour ASC
                  """,
      nativeQuery = true)
  List<DataPoint> findChartUvIndex(@Param("from") Instant from, @Param("to") Instant to);

  @Query(
      value =
          """
                  SELECT hour,
                         ROUND(
                             (((:dryBaseline - LEAST(:dryBaseline, GREATEST(:wetBaseline, surface_wetness_avg)))
                               / (:dryBaseline - :wetBaseline)) * 100)::numeric,
                             1)::double precision AS value
                  FROM hourly_weather_record
                  WHERE hour >= :from AND hour < :to
                  ORDER BY hour ASC
                  """,
      nativeQuery = true)
  List<DataPoint> findChartSurfaceWetness(
      @Param("from") Instant from,
      @Param("to") Instant to,
      @Param("dryBaseline") int dryBaseline,
      @Param("wetBaseline") int wetBaseline);

  /**
   * Mean humidity per hour <em>of the day</em> across a range — the diurnal cycle, not a time
   * series. Every row in the range whose local clock reads 05:00 collapses into one bucket, so 24
   * rows come back however long the range is.
   *
   * <p>Unlike the chart queries above, this one has to know the station's zone: {@code hour} is a
   * {@code TIMESTAMPTZ}, so extracting from it directly buckets by UTC and shifts every answer by
   * the offset. The zone arrives as its id — the same one the chart uses to resolve a date — rather
   * than being inferred from the server's own clock.
   *
   * <p>The {@code hourOfDay} alias is quoted deliberately. Postgres folds unquoted aliases to lower
   * case, which would not match the record component and the projection would fail to bind; the
   * chart queries never meet this because {@code hour} and {@code value} are single lower-case
   * words.
   *
   * <p>{@code samples} is how many days actually contributed to a bucket. Callers need it: an hour
   * the station only saw twice in a fortnight must not be ranked against one it saw every day.
   */
  @Query(
      value =
          """
          SELECT CAST(EXTRACT(HOUR FROM hour AT TIME ZONE :zone) AS INTEGER) AS "hourOfDay",
                 AVG(humidity_avg) AS value,
                 COUNT(humidity_avg) AS samples
          FROM hourly_weather_record
          WHERE hour >= :from AND hour < :to AND humidity_avg IS NOT NULL
          GROUP BY 1 ORDER BY 1
          """,
      nativeQuery = true)
  List<HourOfDayAverage> findHumidityByHourOfDay(
      @Param("zone") String zone, @Param("from") Instant from, @Param("to") Instant to);
}
