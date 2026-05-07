package com.flather.weatherstation.repository;

import com.flather.weatherstation.dto.analytics.TemperatureDto;
import com.flather.weatherstation.dto.analytics.WeatherAvgDto;
import com.flather.weatherstation.dto.projection.HourlyProjection;
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
            WITH latest AS (
        SELECT MAX(measured_at) AS latest_time
        FROM weather_records
    ),
    average AS (
        SELECT
            ROUND(AVG(wr.temperature)::numeric, 1)::double precision AS avgTemperature
        FROM weather_records wr
        CROSS JOIN latest l
        WHERE wr.measured_at >= l.latest_time - INTERVAL '5 minutes'
    ),
    minMax AS (
        SELECT
            MIN(temperature) AS minTemp,
            MAX(temperature) AS maxTemp
        FROM weather_records
        WHERE measured_at >= CURRENT_DATE
          AND measured_at < CURRENT_DATE + INTERVAL '1 day'
    )
    SELECT
        minMax.minTemp,
        minMax.maxTemp,
        average.avgTemperature
    FROM minMax
    CROSS JOIN average;
    """, nativeQuery = true)
    TemperatureDto getTemperature();

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
