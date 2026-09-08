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

  /**
   * The hour in the range that came closest to saturation, and how close — the smallest
   * temperature-minus-dew-point spread, in °C.
   *
   * <p>It returns the <em>spread</em>, not the dew point. The dew point alone says nothing about
   * condensation: 12 °C is unremarkable on a warm afternoon and means water on every surface at 13
   * °C air. The gap between the two is the quantity {@code DewPointRisk} classifies, and the
   * smallest gap over a range is the moment the station came nearest to dew.
   *
   * <p>The Magnus coefficients arrive as parameters rather than being written here, so this and
   * {@link com.flather.weatherstation.util.MeteoMath#calculateDewPoint} cannot drift apart — see
   * the note on {@code MeteoMath.DEW_POINT_A}. The arithmetic itself stays in SQL because the card
   * is a ranking over the whole range: computing it in Java would mean loading every hour of it to
   * keep one row.
   *
   * <p>One row, so no zone is needed — unlike {@link #findHumidityByHourOfDay}, nothing here is
   * bucketed by clock hour. The caller resolves the returned instant into the station's zone to
   * label it.
   *
   * <p><strong>Caution:</strong> {@code LN} is undefined at zero and Postgres <em>raises</em> there
   * rather than returning negative infinity, so a single stored humidity of 0 % fails this query
   * and takes the whole {@code /daily} response down with it — the cards travel with the chart
   * data. No such row exists today, and 0 % is a fault signature rather than a reading, so the
   * floor belongs in validation; until it is there, this query is one bad row from a 500.
   */
  @Query(
      value =
          """
          SELECT hour,
                 temperature_avg - (:magnusB * alpha / (:magnusA - alpha)) AS value
          FROM (
              SELECT hour,
                     temperature_avg,
                     (:magnusA * temperature_avg) / (:magnusB + temperature_avg)
                         + LN(humidity_avg / 100.0) AS alpha
              FROM hourly_weather_record
              WHERE hour >= :from
                AND hour < :to
                AND temperature_avg IS NOT NULL
                AND humidity_avg IS NOT NULL
          ) t
          ORDER BY value ASC
          LIMIT 1
          """,
      nativeQuery = true)
  DataPoint findLowestDewPointGap(
      @Param("from") Instant from,
      @Param("to") Instant to,
      @Param("magnusA") double magnusA,
      @Param("magnusB") double magnusB);
}
