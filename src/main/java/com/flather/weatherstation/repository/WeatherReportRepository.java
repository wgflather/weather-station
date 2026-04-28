package com.flather.weatherstation.repository;

import com.flather.weatherstation.model.dto.MinMaxProjection;
import com.flather.weatherstation.model.dto.MinMaxValueDto;
import com.flather.weatherstation.model.dto.WeatherAvgDto;
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
    with latest_date AS(
    select DATE_TRUNC('day', MAX(measured_at)) as day
    from weather_records)
        
    (select temperature, measured_at
    from  weather_records w
    join latest_date l\s
    on w.measured_at >= l.day
    and w.measured_at < l.day + interval '1 day'
    order by temperature asc
    limit 1)
    
    union
    
    (select temperature, measured_at
    from  weather_records w
    join latest_date l\s
    on w.measured_at >= l.day
    and w.measured_at < l.day + interval '1 day'
    order by temperature desc
    limit 1)
    """, nativeQuery = true)
    List<MinMaxProjection> findFullObjectsWithMinMaxTempOnLatestDate();

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
