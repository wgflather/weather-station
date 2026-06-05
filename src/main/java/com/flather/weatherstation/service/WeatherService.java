package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.SensorStateCache;
import com.flather.weatherstation.config.TimezoneProperties;
import com.flather.weatherstation.dto.projection.MedianProjection;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.repository.WeatherReportRepository;
import java.time.*;
import java.util.Optional;
import java.util.function.ToDoubleFunction;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.math3.stat.descriptive.rank.Median;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
@RequiredArgsConstructor
public class WeatherService {
  private final WeatherReportRepository repository;
  private final DataQualityValidator qualityValidator;
  private final WeatherRecordMapper mapper;
  private final TimezoneProperties timezoneProperties;
  private final SensorStateCache sensorStateCache;

  private MedianProjection estimateMedian() {
    if (sensorStateCache.getSpikeReferenceWindow().isEmpty()) {
      return null;
    }

    Median median = new Median();

    double pressureMedian = medianOf(WeatherRecordResponseDto::getPressure, median);
    double tempMedian = medianOf(WeatherRecordResponseDto::getTemperature, median);

    return new MedianProjection(tempMedian, pressureMedian);
  }

  private double medianOf(ToDoubleFunction<WeatherRecordResponseDto> values, Median median) {
    return median.evaluate(
        sensorStateCache.getSpikeReferenceWindow().stream().mapToDouble(values).toArray());
  }

  @Transactional
  public WeatherRecordResponseDto saveWeatherRecord(WeatherRecordCreatedDto weatherRecordDto) {

    WeatherRecord record = mapper.weatherDtoToEntity(weatherRecordDto);

    boolean isAnomaly = qualityValidator.detectDataAnomaly(weatherRecordDto);

    MedianProjection medianProjection = estimateMedian();

    boolean isSpike =
        qualityValidator.detectDataSpike(
            weatherRecordDto, sensorStateCache.getLastSavedMeasurementAt(), medianProjection);

    DataQuality quality = qualityValidator.determineDataQualityStatus(isAnomaly, isSpike);

    int consecutiveSpikes = sensorStateCache.getConsecutiveSpikes();

    if (quality == DataQuality.SPIKE) {

      consecutiveSpikes++;
      sensorStateCache.setConsecutiveSpikes(consecutiveSpikes);

      if (consecutiveSpikes >= SensorStateCache.SPIKE_REFERENCE_SIZE) {

        // sustained change → accept as new reality
        quality = DataQuality.OK;
      }
    } else {
      sensorStateCache.setConsecutiveSpikes(0);
    }

    record.setDataQuality(quality);

    WeatherRecordResponseDto savedRecord = mapper.weatherEntityToDto(repository.save(record));

    if (quality == DataQuality.OK) {

      if (consecutiveSpikes >= SensorStateCache.SPIKE_REFERENCE_SIZE) {

        // establish a fresh baseline around the new conditions
        sensorStateCache.forceBaselineReset(savedRecord);
        sensorStateCache.setConsecutiveSpikes(0);
      }
      sensorStateCache.updateCachedMeasurements(savedRecord);
    }

    sensorStateCache.setLastSavedMeasurementAt(savedRecord.getMeasuredAtTimeZoned().toInstant());

    return savedRecord;
  }

  @Transactional(readOnly = true)
  public Optional<WeatherRecordResponseDto> getLatestTodayWeatherRecord() {

    ZoneId zoneId = timezoneProperties.getZoneId();

    LocalDate currentDate = LocalDate.now(zoneId);

    Instant startOfTheCurrentDate = currentDate.atStartOfDay(zoneId).toInstant();

    Instant endOfTheCurrentDate = currentDate.plusDays(1).atStartOfDay(zoneId).toInstant();

    return repository
        .findFirstByMeasuredAtBetweenOrderByMeasuredAtDesc(
            startOfTheCurrentDate, endOfTheCurrentDate)
        .map(mapper::weatherEntityToDto);
  }
}
