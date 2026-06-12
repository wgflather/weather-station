package com.flather.weatherstation.repository;

import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface RawDatabaseViewRepository
        extends JpaRepository<WeatherRecord, Long> {

    Page<WeatherRecord> findAllByOrderByMeasuredAtDesc(Pageable pageable);

    @Query("""
    SELECT w
    FROM WeatherRecord w
    WHERE w.temperatureDataQuality = :quality
       OR w.pressureDataQuality = :quality
       OR w.humidityDataQuality = :quality
       OR w.surfaceWetnessDataQuality = :quality
    """)
    Page<WeatherRecord> findAllByQuality(Pageable pageable, @Param("quality") DataQuality dataQuality);

    @Query("""
    SELECT w
    FROM WeatherRecord w
    WHERE w.temperatureDataQuality = :quality
       OR w.pressureDataQuality = :quality
       OR w.humidityDataQuality = :quality
       OR w.surfaceWetnessDataQuality = :quality
    """)
    Page<WeatherRecord> findAllBy(Pageable pageable, @Param("quality") DataQuality dataQuality);

    void deleteById(Long id);

    void deleteByMeasuredAtBefore(Instant cutoff);

    long countByMeasuredAtAfter(Instant cutoff);

    Page<WeatherRecord> findByTemperatureDataQuality(DataQuality quality, Pageable pageable);

    Page<WeatherRecord> findByPressureDataQuality(DataQuality quality, Pageable pageable);

    Page<WeatherRecord> findByHumidityDataQuality(DataQuality quality, Pageable pageable);

    Page<WeatherRecord> findBySurfaceWetnessDataQuality(DataQuality quality, Pageable pageable);
}