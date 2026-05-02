package com.flather.weatherstation.repository;

import com.flather.weatherstation.dto.analytics.WeatherAvgDto;
import com.flather.weatherstation.dto.projection.HourlyProjection;
import com.flather.weatherstation.dto.projection.MinMaxProjection;
import com.flather.weatherstation.model.entity.WeatherRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public interface WeatherReportRepository extends JpaRepository<WeatherRecord, Long> {

    Optional<WeatherRecord> findFirstByMeasuredAtBetweenOrderByMeasuredAtDesc(Instant start, Instant end);


    @Query(value = """
    WITH latest_date AS (
        SELECT DATE_TRUNC('day', MAX(measured_at)) AS day
        FROM weather_records
    )

    (SELECT
        ROUND(temperature::numeric, 1)::double precision AS minTemp,
        measured_at
    FROM weather_records w
    JOIN latest_date l
        ON w.measured_at >= l.day
       AND w.measured_at < l.day + INTERVAL '1 day'
    ORDER BY temperature ASC, measured_at
    LIMIT 1)

    UNION ALL

    (SELECT
        ROUND(temperature::numeric, 1)::double precision AS maxTemp,
        measured_at
    FROM weather_records w
    JOIN latest_date l
        ON w.measured_at >= l.day
       AND w.measured_at < l.day + INTERVAL '1 day'
    ORDER BY temperature DESC, measured_at
    LIMIT 1)
    """, nativeQuery = true)
    List<MinMaxProjection> findMinMaxTemp();

    // Query 1: Fresh data
    @Query(value = """
    SELECT
        ROUND(AVG(temperature)::numeric, 1)::double precision AS avgTemperature,
        ROUND(AVG(pressure)::numeric, 1)::double precision AS avgPressure
    FROM weather_records
    WHERE measured_at >= NOW() - INTERVAL '5 minutes'
    """, nativeQuery = true)
    WeatherAvgDto findLatestAvgComparedToNow();

    // Query 2: Fallback data
    @Query(value = """
    SELECT
        ROUND(AVG(temperature)::numeric, 1)::double precision AS avgTemperature,
        ROUND(AVG(pressure)::numeric, 1)::double precision AS avgPressure
    FROM weather_records
    WHERE measured_at >= (
        SELECT MAX(measured_at) FROM weather_records
    ) - INTERVAL '5 minutes'
    """, nativeQuery = true)
    WeatherAvgDto findLatestAvailableAvg();

    @Query(value = """
        SELECT MAX(measured_at) 
        FROM weather_records
        """, nativeQuery = true)
    Instant findMaxMeasuredAt();

    @Query(value = """
        SELECT COUNT(*) 
        FROM weather_records 
        WHERE measured_at::date >= CURRENT_DATE 
        AND measured_at < CURRENT_DATE + INTERVAL '1 day'
        """, nativeQuery = true)
    long findRecordsToday();

    @Query(value = """
    SELECT
        date_bin('10 minutes', measured_at, current_date) AS bucket,
        ROUND(AVG(temperature)::numeric, 1)::double precision AS value
    FROM weather_records
    WHERE measured_at >= CURRENT_DATE
      AND measured_at < CURRENT_DATE + INTERVAL '1 day'
    GROUP BY bucket
    ORDER BY bucket ASC
    """, nativeQuery = true)
    List<HourlyProjection> findTodayHourlyTemperature();
}
