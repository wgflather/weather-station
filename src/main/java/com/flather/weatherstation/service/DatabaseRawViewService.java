package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
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
import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class DatabaseRawViewService {
    private final RawDatabaseViewRepository repository;
    private final ConfigurationCache configurationCache;
    public Page<WeatherRecord> getRecordsByQuality(DataQuality quality, Pageable pageable){
        return repository.findAllByQuality(pageable, quality);
    }

    public Page<WeatherRecord> getRecordsByDate(LocalDate date, Pageable pageable){
        Instant startDate = date.atStartOfDay(configurationCache.getLocationContext().zoneId()).toInstant();
        Instant endDate = date.atStartOfDay(configurationCache.getLocationContext().zoneId()).plusDays(1).toInstant();
        return repository.getRecordsBetween(startDate, endDate, pageable);
    }

    public Page<WeatherRecord> getRecordBetween(LocalDate start, LocalDate end, Pageable pageable){
        Instant startDate = start.atStartOfDay(configurationCache.getLocationContext().zoneId()).toInstant();
        Instant endDate = end.atStartOfDay(configurationCache.getLocationContext().zoneId()).plusDays(1).toInstant();
        return repository.getRecordsBetween(startDate, endDate, pageable);
    }

    public Page<WeatherRecord> getRecords(boolean all, DataQuality quality, Pageable pageable, Metric metric,
                                          LocalDate startDate, LocalDate endDate) {
        boolean hasDate    = startDate != null;
        boolean hasQuality = !all && quality != null;
        boolean hasMetric  = hasQuality && metric != null;

        if (hasDate) {
            Instant start = toStartInstant(startDate);
            Instant end   = toEndInstant(endDate != null ? endDate : startDate);
            if (hasMetric)  return findByMetricAndQualityBetween(metric, quality, start, end, pageable);
            if (hasQuality) return repository.findByQualityBetween(quality, start, end, pageable);
            return repository.getRecordsBetween(start, end, pageable);
        }

        if (hasMetric)  return findByMetricAndQuality(metric, quality, pageable);
        if (hasQuality) return getRecordsByQuality(quality, pageable);
        return repository.findAllByOrderByMeasuredAtDesc(pageable);
    }

    private Instant toStartInstant(LocalDate date) {
        return date.atStartOfDay(configurationCache.getLocationContext().zoneId()).toInstant();
    }

    private Instant toEndInstant(LocalDate date) {
        return date.atStartOfDay(configurationCache.getLocationContext().zoneId()).plusDays(1).toInstant();
    }

    private Page<WeatherRecord> findByMetricAndQualityBetween(Metric metric, DataQuality quality,
                                                               Instant start, Instant end, Pageable pageable) {
        return switch (metric) {
            case TEMPERATURE -> repository.findByTemperatureQualityBetween(quality, start, end, pageable);
            case PRESSURE    -> repository.findByPressureQualityBetween(quality, start, end, pageable);
            case HUMIDITY    -> repository.findByHumidityQualityBetween(quality, start, end, pageable);
            case SURFACE_WETNESS -> repository.findBySurfaceWetnessQualityBetween(quality, start, end, pageable);
        };
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


    public List<String> getAvailableDates(LocalDate from, LocalDate to) {
        String zone = configurationCache.getLocationContext().zoneId().getId();
        return repository.findDistinctMeasuredDatesBetween(zone, from, to);
    }

    public void deleteOlderThan(Instant cutoff) {
        repository.deleteByMeasuredAtBefore(cutoff);
    }
}
