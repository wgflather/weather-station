package com.flather.weatherstation.cache;

import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.dto.projection.ExtremesProjection;
import jakarta.annotation.PostConstruct;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.*;
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
  private final Deque<WeatherRecord> metricsWindow = new ArrayDeque<>();

  // Spike detection reference — small, can be reset aggressively
  // represents "current conditions" not "recent history"
  @Getter private final Map<Metric, Deque<Double>> metricsSpikeWindow;

  private static final int METRICS_WINDOW_MINUTES = 60;
  public static final int SPIKE_REFERENCE_SIZE = 5;

  private final ConfigurationCache configurationCache;

  private final Map<Metric, Integer> consecutiveSpikes;

  private volatile LocalDate lastProcessedDate;

  @Getter @Setter private volatile Double todayMaxTemp;

  @Getter @Setter private volatile Double todayMinTemp;

  @Setter @Getter private volatile WeatherRecord lastSavedMeasurement;

  @PostConstruct
  void init() {
    lastProcessedDate = LocalDate.now(configurationCache.getLocationContext().zoneId());
  }

  public SensorStateCache(ConfigurationCache configurationCache) {
    this.configurationCache = configurationCache;
    metricsSpikeWindow =
        Map.of(
            Metric.TEMPERATURE, new ArrayDeque<>(),
            Metric.PRESSURE, new ArrayDeque<>(),
            Metric.HUMIDITY, new ArrayDeque<>());

    consecutiveSpikes =
        new EnumMap<>(
            Map.of(
                Metric.TEMPERATURE, 0,
                Metric.PRESSURE, 0,
                Metric.HUMIDITY, 0));
  }

  @Scheduled(fixedRate = 20_000)
  public void checkDailyReset() {

    ZoneId zone = configurationCache.getLocationContext().zoneId();

    LocalDate currentDate = LocalDate.now(zone);

    if (!currentDate.equals(lastProcessedDate)) {

      log.info("[DAILY_RESET] Date changed from {} to {}", lastProcessedDate, currentDate);

      resetDailyTemperatureExtremes();

      lastProcessedDate = currentDate;
    }
  }

  public synchronized List<WeatherRecord> getMetricsWindow() {
    return List.copyOf(metricsWindow);
  }

  public synchronized List<Double> getSpikeWindowSnapshot(Metric metric) {
    Deque<Double> values = metricsSpikeWindow.get(metric);

    return values == null ? List.of() : List.copyOf(values);
  }

  private void addSpikeIfPresent(Metric metric, Double value) {
    if (value != null) {
      updateSpikeReferenceWindow(metric, value);
    }
  }

  private void addSpikes(WeatherRecord dto) {
    addSpikeIfPresent(Metric.TEMPERATURE, dto.getTemperature());
    addSpikeIfPresent(Metric.PRESSURE, dto.getPressure());
    addSpikeIfPresent(Metric.HUMIDITY, dto.getHumidity());
  }

  void loadCacheSnapshot(List<WeatherRecord> dtos, ExtremesProjection extremesProjection) {

    log.info(
        "[CACHE_INIT] Loading cache snapshot: {} records, min={}, max={}",
        dtos.size(),
        extremesProjection.min(),
        extremesProjection.max());

    metricsWindow.addAll(dtos);

    if (dtos.size() >= SPIKE_REFERENCE_SIZE) {
      dtos.subList(dtos.size() - SPIKE_REFERENCE_SIZE, dtos.size()).forEach(this::addSpikes);
    } else {
      dtos.forEach(this::addSpikes);
    }


    todayMaxTemp = extremesProjection.max();
    todayMinTemp = extremesProjection.min();

    log.info(
        "[CACHE_INIT] Cache initialized successfully. metricsWindowSize={}", metricsWindow.size());
  }

  public synchronized void resetDailyTemperatureExtremes() {
    todayMinTemp = null;
    todayMaxTemp = null;
  }

  public synchronized void updateCachedMeasurements(WeatherRecord savedRecord) {

    log.debug(
        "[CACHE_UPDATE] New measurement received: temp={}, pressure={}, time={}",
        savedRecord.getTemperature(),
        savedRecord.getPressure(),
        savedRecord.getMeasuredAt().atZone(configurationCache.getLocationContext().zoneId()));

    updateMetricsWindow(savedRecord);
    if (savedRecord.getTemperature() != null) {
      checkNewExtremes(savedRecord);
    } else {
      log.debug("[EXTREMES_CHECK] Skipping extremes check, temperature is null");
    }
  }

  public synchronized void updateCachedMeasurement(Metric metric, double value) {
    metricsSpikeWindow.get(metric).addLast(value);

    while (metricsSpikeWindow.get(metric).size() > SPIKE_REFERENCE_SIZE) {
      metricsSpikeWindow.get(metric).removeFirst();
    }
  }

  private void checkNewExtremes(WeatherRecord savedRecord) {
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

  private void updateMetricsWindow(WeatherRecord savedRecord) {
    metricsWindow.addLast(savedRecord);

    Instant cutoff = savedRecord.getMeasuredAt().minus(METRICS_WINDOW_MINUTES, ChronoUnit.MINUTES);

    while (!metricsWindow.isEmpty() && metricsWindow.peekFirst().getMeasuredAt().isBefore(cutoff)) {

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
        metricToReset,
        newReality);

    metricsSpikeWindow.get(metricToReset).clear();

    metricsSpikeWindow.get(metricToReset).addLast(newReality);
  }
}
