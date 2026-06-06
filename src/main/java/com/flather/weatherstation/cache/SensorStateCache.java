package com.flather.weatherstation.cache;

import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.dto.projection.ExtremesProjection;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

import jakarta.annotation.PostConstruct;
import lombok.Getter;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class SensorStateCache {

  // 60-min rolling window — dashboard metrics, trend, averages
  // never forcefully reset, represents continuous sensor history
  @Getter private final Deque<WeatherRecordResponseDto> metricsWindow = new ArrayDeque<>();

  // Spike detection reference — small, can be reset aggressively
  // represents "current conditions" not "recent history"
  @Getter private final Map<Metric, Deque<Double>> metricsSpikeWindow = Map.of(
          Metric.TEMPERATURE, new ArrayDeque<>(),
          Metric.PRESSURE, new ArrayDeque<>(),
          Metric.HUMIDITY, new ArrayDeque<>()
        );

  private static final int METRICS_WINDOW_MINUTES = 60;
  public static final int SPIKE_REFERENCE_SIZE = 5;

  private final Map<Metric, Integer> consecutiveSpikes = new EnumMap<>(Map.of(
          Metric.TEMPERATURE, 0,
          Metric.PRESSURE, 0,
          Metric.HUMIDITY, 0
  ));

  @Getter @Setter private volatile Double todayMaxTemp;

  @Getter @Setter private volatile Double todayMinTemp;

  @Setter @Getter private volatile Instant lastSavedMeasurementAt;

  @Scheduled(cron = "0 0 0 * * *", zone = "#{@timezoneProperties.zoneId}")
  public void resetDailyExtremes() {
    log.info("[DAILY_RESET] Resetting daily temperature extremes");
    resetDailyTemperatureExtremes();
  }

  public synchronized List<Double> getSpikeWindowSnapshot(Metric metric) {
    Deque<Double> values = metricsSpikeWindow.get(metric);

    return values == null
            ? List.of()
            : List.copyOf(values);
  }

  private void addSpikeIfPresent(Metric metric, Double value) {
    if (value != null) {
      updateSpikeReferenceWindow(metric, value);
    }
  }

  private void addSpikes(WeatherRecordResponseDto dto) {
    addSpikeIfPresent(Metric.TEMPERATURE, dto.getTemperature());
    addSpikeIfPresent(Metric.PRESSURE, dto.getPressure());
    addSpikeIfPresent(Metric.HUMIDITY, dto.getHumidity());
  }

  void loadCacheSnapshot(
      List<WeatherRecordResponseDto> dtos, ExtremesProjection extremesProjection) {

    log.info(
        "[CACHE_INIT] Loading cache snapshot: {} records, min={}, max={}",
        dtos.size(),
        extremesProjection.min(),
        extremesProjection.max());

    metricsWindow.addAll(dtos);

    dtos.subList(0, dtos.size() - SPIKE_REFERENCE_SIZE)
            .forEach(this::addSpikes);

    todayMaxTemp = extremesProjection.max();
    todayMinTemp = extremesProjection.min();

    log.info(
        "[CACHE_INIT] Cache initialized successfully. metricsWindowSize={}", metricsWindow.size());
  }

  public synchronized void resetDailyTemperatureExtremes() {
    todayMinTemp = null;
    todayMaxTemp = null;
  }

  public synchronized void updateCachedMeasurements(WeatherRecordResponseDto savedRecord) {

    log.debug(
        "[CACHE_UPDATE] New measurement received: temp={}, pressure={}, time={}",
        savedRecord.getTemperature(),
        savedRecord.getPressure(),
        savedRecord.getMeasuredAtTimeZoned());

    updateMetricsWindow(savedRecord);
    if(savedRecord.getTemperature() != null) {
      checkNewExtremes(savedRecord);
    }else {
      log.debug("[EXTREMES_CHECK] Skipping extremes check, temperature is null");
    }
  }

  public synchronized void updateCachedMeasurement(Metric metric, double value) {
    metricsSpikeWindow.get(metric).addLast(value);

    while (metricsSpikeWindow.get(metric).size() > SPIKE_REFERENCE_SIZE) {
      metricsSpikeWindow.get(metric).removeFirst();
    }
  }

  private void checkNewExtremes(WeatherRecordResponseDto savedRecord) {
    double temp = savedRecord.getTemperature();

    if (todayMaxTemp == null && todayMinTemp == null) {

      todayMaxTemp = temp;
      todayMinTemp = temp;

      log.info("[EXTREMES_INIT] First temperature of day: {}", temp);
      return;
    }

    if (temp > todayMaxTemp) {
      log.info("[NEW_MAX_TEMP] {} → {}", todayMaxTemp, temp);
      todayMaxTemp = temp;
    }

    if (temp < todayMinTemp) {
      log.info("[NEW_MIN_TEMP] {} → {}", todayMinTemp, temp);
      todayMinTemp = temp;
    }
  }

  private void updateMetricsWindow(WeatherRecordResponseDto savedRecord) {

    metricsWindow.addLast(savedRecord);

    Instant cutoff =
        savedRecord
            .getMeasuredAtTimeZoned()
            .toInstant()
            .minus(METRICS_WINDOW_MINUTES, ChronoUnit.MINUTES);

    while (!metricsWindow.isEmpty()
        && metricsWindow.peekFirst().getMeasuredAtTimeZoned().toInstant().isBefore(cutoff)) {

      metricsWindow.removeFirst();
    }
  }

  private void updateSpikeReferenceWindow(Metric metric, double value) {

    metricsSpikeWindow.get(metric).addLast(value);

    while (metricsSpikeWindow.get(metric).size() > SPIKE_REFERENCE_SIZE) {
      metricsSpikeWindow.get(metric).removeFirst();
    }
  }

  public synchronized void updateSpikeState(Metric metric, DataQuality quality, double value) {

    if (quality == DataQuality.SPIKE) {

      int spikes = consecutiveSpikes.get(metric);
      spikes++;
      log.info("spikes {}", spikes);

      consecutiveSpikes.put(metric, spikes);

      if (spikes >= SPIKE_REFERENCE_SIZE) {
        consecutiveSpikes.put(metric, 0);

        forceBaselineReset(metric, value);
      }

    } else {
      consecutiveSpikes.put(metric, 0);
    }
  }

  public synchronized void forceBaselineReset(Metric metricToReset, double newReality) {
    log.info(
        "[BASELINE_RESET] Spike reference window reset for {}. New baseline = {}",
            metricToReset, newReality);

    metricsSpikeWindow.get(metricToReset).clear();

    metricsSpikeWindow.get(metricToReset).addLast(newReality);
  }
}
