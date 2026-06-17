package com.flather.weatherstation.repository;

import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface RawDatabaseViewRepository extends JpaRepository<WeatherRecord, Long> {

  Page<WeatherRecord> findAllByOrderByMeasuredAtDesc(Pageable pageable);

  @Query(
      """
    SELECT w
    FROM WeatherRecord w
    WHERE w.temperatureDataQuality = :quality
       OR w.pressureDataQuality = :quality
       OR w.humidityDataQuality = :quality
       OR w.surfaceWetnessDataQuality = :quality
       OR w.windDataQuality = :quality
       OR w.uvIndexDataQuality = :quality
    """)
  Page<WeatherRecord> findAllByQuality(
      Pageable pageable, @Param("quality") DataQuality dataQuality);

  @Query(
      """
    SELECT w
    FROM WeatherRecord w
    WHERE w.temperatureDataQuality = :quality
       OR w.pressureDataQuality = :quality
       OR w.humidityDataQuality = :quality
       OR w.surfaceWetnessDataQuality = :quality
       OR w.windDataQuality = :quality
       OR w.uvIndexDataQuality = :quality
    """)
  Page<WeatherRecord> findAllBy(Pageable pageable, @Param("quality") DataQuality dataQuality);

  @Query(
      """
    SELECT w FROM WeatherRecord w
    WHERE w.measuredAt >= :start AND w.measuredAt < :end
    """)
  Page<WeatherRecord> getRecordsBetween(
      @Param("start") Instant start, @Param("end") Instant end, Pageable pageable);

  void deleteById(Long id);

  void deleteByMeasuredAtBefore(Instant cutoff);

  long countByMeasuredAtAfter(Instant cutoff);

  Page<WeatherRecord> findByTemperatureDataQuality(DataQuality quality, Pageable pageable);

  Page<WeatherRecord> findByPressureDataQuality(DataQuality quality, Pageable pageable);

  Page<WeatherRecord> findByHumidityDataQuality(DataQuality quality, Pageable pageable);

  Page<WeatherRecord> findBySurfaceWetnessDataQuality(DataQuality quality, Pageable pageable);

  @Query(
      """
    SELECT w FROM WeatherRecord w
    WHERE (w.temperatureDataQuality = :quality
       OR w.pressureDataQuality = :quality
       OR w.humidityDataQuality = :quality
       OR w.surfaceWetnessDataQuality = :quality
       OR w.windDataQuality = :quality
       OR w.uvIndexDataQuality = :quality)
    AND w.measuredAt >= :start AND w.measuredAt < :end
    """)
  Page<WeatherRecord> findByQualityBetween(
      @Param("quality") DataQuality quality,
      @Param("start") Instant start,
      @Param("end") Instant end,
      Pageable pageable);

  Page<WeatherRecord> findByWindDataQuality(DataQuality quality, Pageable pageable);

  Page<WeatherRecord> findByUvIndexDataQuality(DataQuality quality, Pageable pageable);

  @Query(
      "SELECT w FROM WeatherRecord w WHERE w.windDataQuality = :quality AND w.measuredAt >= :start AND w.measuredAt < :end")
  Page<WeatherRecord> findByWindQualityBetween(
      @Param("quality") DataQuality quality,
      @Param("start") Instant start,
      @Param("end") Instant end,
      Pageable pageable);

  @Query(
      "SELECT w FROM WeatherRecord w WHERE w.uvIndexDataQuality = :quality AND w.measuredAt >= :start AND w.measuredAt < :end")
  Page<WeatherRecord> findByUvIndexQualityBetween(
      @Param("quality") DataQuality quality,
      @Param("start") Instant start,
      @Param("end") Instant end,
      Pageable pageable);

  @Query(
      "SELECT w FROM WeatherRecord w WHERE w.temperatureDataQuality = :quality AND w.measuredAt >= :start AND w.measuredAt < :end")
  Page<WeatherRecord> findByTemperatureQualityBetween(
      @Param("quality") DataQuality quality,
      @Param("start") Instant start,
      @Param("end") Instant end,
      Pageable pageable);

  @Query(
      "SELECT w FROM WeatherRecord w WHERE w.pressureDataQuality = :quality AND w.measuredAt >= :start AND w.measuredAt < :end")
  Page<WeatherRecord> findByPressureQualityBetween(
      @Param("quality") DataQuality quality,
      @Param("start") Instant start,
      @Param("end") Instant end,
      Pageable pageable);

  @Query(
      "SELECT w FROM WeatherRecord w WHERE w.humidityDataQuality = :quality AND w.measuredAt >= :start AND w.measuredAt < :end")
  Page<WeatherRecord> findByHumidityQualityBetween(
      @Param("quality") DataQuality quality,
      @Param("start") Instant start,
      @Param("end") Instant end,
      Pageable pageable);

  @Query(
      "SELECT w FROM WeatherRecord w WHERE w.surfaceWetnessDataQuality = :quality AND w.measuredAt >= :start AND w.measuredAt < :end")
  Page<WeatherRecord> findBySurfaceWetnessQualityBetween(
      @Param("quality") DataQuality quality,
      @Param("start") Instant start,
      @Param("end") Instant end,
      Pageable pageable);

  @Query(
      value =
          """
            SELECT DISTINCT (measured_at AT TIME ZONE :zone)::date::text
            FROM weather_records
            WHERE (measured_at AT TIME ZONE :zone)::date BETWEEN CAST(:from AS date) AND CAST(:to AS date)
            ORDER BY 1 DESC
            """,
      nativeQuery = true)
  List<String> findDistinctMeasuredDatesBetween(
      @Param("zone") String zone, @Param("from") LocalDate from, @Param("to") LocalDate to);
}
