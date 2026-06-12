package com.flather.weatherstation.service;

import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.repository.RawDatabaseViewRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

import java.time.Instant;

@Service
@RequiredArgsConstructor
public class DatabaseRawViewService {
    private final RawDatabaseViewRepository repository;

    public Page<WeatherRecord> getRecordsByQuality(DataQuality quality, Pageable pageable){
        return repository.findAllByQuality(pageable, quality);
    }

    public Page<WeatherRecord> getRecords(boolean all, DataQuality quality, Pageable pageable, Metric metric){

        if(metric != null && quality != null && !all){
            return findByMetricAndQuality(metric, quality, pageable);
        }else if(metric == null && quality != null && !all){
            return getRecordsByQuality(quality, pageable);
        }

        return repository.findAllByOrderByMeasuredAtDesc(pageable);


    }

    public boolean deleteRecord(Long id) {
        if (repository.existsById(id)) {
            repository.deleteById(id);
            return true;
        }
        return false;
    }

    public Page<WeatherRecord> findByMetricAndQuality(
            Metric metric,
            DataQuality quality,
            Pageable pageable
    ) {

        return switch (metric) {

            case TEMPERATURE ->
                    repository.findByTemperatureDataQuality(quality, pageable);

            case PRESSURE ->
                    repository.findByPressureDataQuality(quality, pageable);

            case HUMIDITY ->
                    repository.findByHumidityDataQuality(quality, pageable);

            case SURFACE_WETNESS ->
                    repository.findBySurfaceWetnessDataQuality(quality, pageable);
        };
    }


    public void deleteOlderThan(Instant cutoff) {
        repository.deleteByMeasuredAtBefore(cutoff);
    }
}
