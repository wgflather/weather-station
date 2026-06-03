package com.flather.weatherstation.service;

import com.flather.weatherstation.config.TimezoneProperties;
import com.flather.weatherstation.dto.projection.MedianProjection;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.model.constant.DataQuality;
import com.flather.weatherstation.model.entity.WeatherRecord;
import com.flather.weatherstation.repository.WeatherReportRepository;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.Optional;
import java.util.function.ToDoubleFunction;

import jakarta.persistence.criteria.CriteriaBuilder;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
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

  private final Deque<WeatherRecordResponseDto> recentMeasurements = new ArrayDeque<>();

  @Setter
  @Getter
  private volatile Instant lastSavedMeasurement;

  private MedianProjection estimateMedian(){
    if(recentMeasurements.isEmpty()){ return null; }

    Median median = new Median();

    double pressureMedian = medianOf(WeatherRecordResponseDto::getPressure, median);
    double tempMedian = medianOf(WeatherRecordResponseDto::getTemperature, median);

    return new MedianProjection(tempMedian, pressureMedian);
  }

  private double medianOf(ToDoubleFunction<WeatherRecordResponseDto> values, Median median) {
    return median.evaluate(
            recentMeasurements.stream()
                    .mapToDouble(values)
                    .toArray()
    );
  }

  @Transactional
  public WeatherRecordResponseDto saveWeatherRecord(WeatherRecordCreatedDto weatherRecordDto) {

    WeatherRecord record = mapper.weatherDtoToEntity(weatherRecordDto);

    boolean isAnomaly = qualityValidator.detectDataAnomaly(weatherRecordDto);

    boolean isSpike = qualityValidator.detectDataSpike(weatherRecordDto, lastSavedMeasurement, estimateMedian());

    DataQuality quality = qualityValidator.determineDataQualityStatus(isAnomaly, isSpike);

    record.setDataQuality(quality);

    WeatherRecordResponseDto savedRecord = mapper.weatherEntityToDto(repository.save(record));

      if(quality == DataQuality.OK){
        recentMeasurements.addLast(savedRecord);

        Instant cutoff = savedRecord.getMeasuredAtTimeZoned().toInstant().minus(1, ChronoUnit.HOURS);

        while (!recentMeasurements.isEmpty()
                && recentMeasurements.peekFirst()
                .getMeasuredAtTimeZoned().toInstant()
                .isBefore(cutoff)) {

          recentMeasurements.removeFirst();
        }

      }

    setLastSavedMeasurement(savedRecord.getMeasuredAtTimeZoned().toInstant());

    return savedRecord;
  }

  @Transactional(readOnly = true)
  public Optional<WeatherRecordResponseDto> getLatestTodayWeatherRecord() {

    ZoneId zoneId = ZoneId.of(timezoneProperties.getZoneId());

    LocalDate currentDate = LocalDate.now(zoneId);

    Instant startOfTheCurrentDate = currentDate.atStartOfDay(zoneId).toInstant();

    Instant endOfTheCurrentDate = currentDate.plusDays(1).atStartOfDay(zoneId).toInstant();

    return repository
        .findFirstByMeasuredAtBetweenOrderByMeasuredAtDesc(
            startOfTheCurrentDate, endOfTheCurrentDate)
        .map(mapper::weatherEntityToDto);
  }
}
