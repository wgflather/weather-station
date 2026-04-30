package com.flather.weatherstation.repository;

import com.flather.weatherstation.model.dto.*;
import com.flather.weatherstation.model.entity.WeatherRecord;
import jakarta.persistence.criteria.CriteriaBuilder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Map;
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
    join latest_date l
    on w.measured_at >= l.day
    and w.measured_at < l.day + interval '1 day'
    order by temperature asc, measured_at
    limit 1)
    
    union all
    
    (select temperature, measured_at
    from  weather_records w
    join latest_date l
    on w.measured_at >= l.day
    and w.measured_at < l.day + interval '1 day'
    order by temperature desc, measured_at
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

    @Query(value = """

            SELECT
    date_bin('30 minutes', measured_at, current_date) AS bucket,
    AVG(temperature) as avgTemp
FROM weather_records
where measured_at  >= current_date and measured_at < current_date + interval '1 day'
GROUP BY bucket
ORDER BY bucket ASC;

    
    """, nativeQuery = true)
    List<HourlyProjection> findTodayHourlyTemperature();
}
