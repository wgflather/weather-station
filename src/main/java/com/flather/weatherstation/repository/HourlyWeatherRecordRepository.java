package com.flather.weatherstation.repository;

import com.flather.weatherstation.domain.entity.HourlyWeatherRecord;
import com.flather.weatherstation.dto.projection.DataPoint;
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
}
