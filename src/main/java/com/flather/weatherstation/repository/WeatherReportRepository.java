package com.flather.weatherstation.repository;

import com.flather.weatherstation.entity.WeatherRecord;
import com.flather.weatherstation.entity.WeatherRecordResponseDto;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WeatherReportRepository extends JpaRepository<WeatherRecord, Long> {

    Optional<WeatherRecord> findFirstByOrderByMeasuredAtDesc();
    @Query(value = "SELECT , MAX(temperature) " +
            "FROM weather_records " +
            "WHERE measured_at::date = (SELECT MAX(measured_at::date) FROM weather_records)",
            nativeQuery = true)
    List<Object[]> findMinMaxByLatestDate();

    @Query(value = "SELECT * FROM weather_records " +
            "WHERE measured_at::date = (SELECT MAX(measured_at)::date FROM weather_records)" +
            "AND temperature IN (" +
            "SELECT MAX(temperature) FROM weather_records WHERE measured_at::date = (SELECT MAX(measured_at::date) FROM weather_records)" +
            "UNION " +
            "SELECT MIN(temperature) FROM weather_records WHERE measured_at::date = (SELECT MAX(measured_at)::date FROM weather_records))",
            nativeQuery = true)

    List<WeatherRecord> findFullObjectsWithMaxValOnLatestDate();
}
