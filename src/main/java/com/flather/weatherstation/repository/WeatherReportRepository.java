package com.flather.weatherstation.repository;

import com.flather.weatherstation.entity.WeatherRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface WeatherReportRepository extends JpaRepository<WeatherRecord, Long> {

    WeatherRecord findFirstByOrderByMeasuredAtDesc();
}
