package com.flather.weatherstation.cache;

import com.flather.weatherstation.dto.projection.ExtremesProjection;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import lombok.Getter;
import lombok.Setter;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class SensorStateCache {

  // 60-min rolling window — dashboard metrics, trend, averages
  // never forcefully reset, represents continuous sensor history
  @Getter private final Deque<WeatherRecordResponseDto> metricsWindow = new ArrayDeque<>();

  // Spike detection reference — small, can be reset aggressively
  // represents "current conditions" not "recent history"
  @Getter private final Deque<WeatherRecordResponseDto> spikeReferenceWindow = new ArrayDeque<>();

  private static final int METRICS_WINDOW_MINUTES = 60;
  public static final int SPIKE_REFERENCE_SIZE = 5;

  @Setter @Getter private volatile int consecutiveSpikes = 0;

  @Getter @Setter private volatile Double todayMaxTemp;

  @Getter @Setter private volatile Double todayMinTemp;

  @Setter @Getter private volatile Instant lastSavedMeasurementAt;

  @Scheduled(cron = "0 0 0 * * *", zone = "#{@timezoneProperties.zoneId}")
  public void resetDailyExtremes() {
    resetDailyTemperatureExtremes();
  }

  void loadCacheSnapshot(
      List<WeatherRecordResponseDto> dtos, ExtremesProjection extremesProjection) {
    metricsWindow.addAll(dtos);
    spikeReferenceWindow.addAll(metricsWindow.stream().limit(5).toList());
    todayMaxTemp = extremesProjection.max();
    todayMinTemp = extremesProjection.min();
  }

  public synchronized void resetDailyTemperatureExtremes() {
    todayMinTemp = null;
    todayMaxTemp = null;
  }

  public synchronized void updateCachedMeasurements(WeatherRecordResponseDto savedRecord) {

    updateMetricsWindow(savedRecord);
    updateSpikeReferenceWindow(savedRecord);
    checkNewExtremes(savedRecord);
  }

  private void checkNewExtremes(WeatherRecordResponseDto savedRecord) {
    if (todayMaxTemp == null && todayMinTemp == null) {
      todayMaxTemp = savedRecord.getTemperature();
      todayMinTemp = savedRecord.getTemperature();
    } else {
      if (todayMaxTemp < savedRecord.getTemperature()) {
        todayMaxTemp = savedRecord.getTemperature();
      }

      if (todayMinTemp > savedRecord.getTemperature()) {
        todayMinTemp = savedRecord.getTemperature();
      }
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

  private void updateSpikeReferenceWindow(WeatherRecordResponseDto savedRecord) {

    spikeReferenceWindow.addLast(savedRecord);

    while (spikeReferenceWindow.size() > SPIKE_REFERENCE_SIZE) {
      spikeReferenceWindow.removeFirst();
    }
  }

  public synchronized void forceBaselineReset(WeatherRecordResponseDto newReality) {

    spikeReferenceWindow.clear();

    spikeReferenceWindow.addLast(newReality);
  }
}
