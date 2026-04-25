package com.flather.weatherstation.repository;

import com.flather.weatherstation.entity.WeatherAvgDto;
import com.flather.weatherstation.entity.WeatherRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface WeatherReportRepository extends JpaRepository<WeatherRecord, Long> {

    Optional<WeatherRecord> findFirstByMeasuredAtBetweenOrderByMeasuredAtDesc(Instant start, Instant end);

    @Query(value = "SELECT * FROM weather_records " +
            "WHERE measured_at::date = (SELECT MAX(measured_at)::date FROM weather_records)" +
            "AND temperature IN (" +
            "SELECT MAX(temperature) FROM weather_records WHERE measured_at::date = (SELECT MAX(measured_at::date) FROM weather_records)" +
            "UNION " +
            "SELECT MIN(temperature) FROM weather_records WHERE measured_at::date = (SELECT MAX(measured_at)::date FROM weather_records))",
            nativeQuery = true)

    List<WeatherRecord> findFullObjectsWithMinMaxTempOnLatestDate();

    // Query 1: Fresh data
    @Query(value = "SELECT AVG(temperature) AS avgTemperature, AVG(pressure) AS avgPressure " +
            "FROM weather_records " +
            "WHERE measured_at >= NOW() - INTERVAL '5 minutes'",
            nativeQuery = true)
    WeatherAvgDto findLatestAvgComparedToNow();

    // Query 2: Fallback data
    @Query(value = "SELECT AVG(temperature) AS avgTemperature, AVG(pressure) AS avgPressure " +
            "FROM weather_records " +
            "WHERE measured_at >= (SELECT MAX(measured_at) FROM weather_records) - INTERVAL '5 minutes'",
            nativeQuery = true)
    WeatherAvgDto findLatestAvailableAvg();

    @Query(value = "SELECT MAX(measured_at) FROM weather_records", nativeQuery = true)
    Instant findMaxMeasuredAt();

    @Query(value = "SELECT COUNT(*) FROM weather_records WHERE measured_at::date = CURRENT_DATE", nativeQuery = true)
    long findRecordsToday();
}
