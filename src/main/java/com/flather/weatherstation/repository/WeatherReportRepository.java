package com.flather.weatherstation.repository;

import com.flather.weatherstation.entity.WeatherRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface WeatherReportRepository extends JpaRepository<WeatherRecord, Long> {

    Optional<WeatherRecord> findFirstByOrderByMeasuredAtDesc();
}
