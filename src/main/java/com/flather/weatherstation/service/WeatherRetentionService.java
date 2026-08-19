package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.repository.DailyWeatherRecordRepository;
import com.flather.weatherstation.repository.WeatherRetentionRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.concurrent.TimeUnit;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Slf4j
@RequiredArgsConstructor
@Service
public class WeatherRetentionService {

  private static final LocalTime MIDNIGHT_WINDOW_START = LocalTime.of(0, 5);
  private static final LocalTime MIDNIGHT_WINDOW_END = LocalTime.of(0, 15);
  private static final LocalTime MAINTENANCE_WINDOW_START = LocalTime.of(2, 0);
  private static final LocalTime MAINTENANCE_WINDOW_END = LocalTime.of(2, 10);

  private final WeatherRetentionRepository retentionRepository;
  private final DailyWeatherRecordRepository dailyRecordRepository;
  private final ConfigurationCache configurationCache;

  @Scheduled(fixedRate = 5, timeUnit = TimeUnit.MINUTES)
  public void rollUpAndCleanData() {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();
    LocalTime now = LocalTime.now(zoneId);

    if (now.isBefore(MAINTENANCE_WINDOW_START) || now.isAfter(MAINTENANCE_WINDOW_END)) {
      return;
    }

    Instant cutoff = LocalDate.now(zoneId).minusDays(30).atStartOfDay(zoneId).toInstant();

    retentionRepository.rollupHourly();
    retentionRepository.rollupDaily(zoneId.toString());
    retentionRepository.deleteRawOlderThan(cutoff);
  }

  @Scheduled(fixedRate = 5, timeUnit = TimeUnit.MINUTES)
  public void generateYesterdaySummaryAtMidnight() {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();
    LocalTime now = LocalTime.now(zoneId);

    if (now.isBefore(MIDNIGHT_WINDOW_START) || now.isAfter(MIDNIGHT_WINDOW_END)) {
      return;
    }

    LocalDate yesterday = LocalDate.now(zoneId).minusDays(1);

    if (dailyRecordRepository.findByDate(yesterday).isPresent()) {
      log.debug("Daily summary for {} already exists, skipping midnight generation", yesterday);
      return;
    }

    retentionRepository.rollupDaily(zoneId.toString());
    log.info("Generated daily summary for {}", yesterday);
  }
}
