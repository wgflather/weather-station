package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.domain.constant.DayPeriod;
import com.flather.weatherstation.dto.astronomy.DayPeriodInterval;
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

  private static final int RAW_RETENTION_DAYS = 29;

  // Wind direction is only aggregated from readings above this speed: a vane sitting in still air
  // reports noise, and averaging that noise in drags the resultant bearing off the real one.
  private static final double CALM_THRESHOLD_MS = 0.5;

  // Below this resultant-vector length the hour's bearings cancelled out and no single direction
  // describes the hour, so the bearing is stored as null rather than as a meaningless number.
  private static final double MIN_DIRECTION_CONSISTENCY = 0.05;

  private final WeatherRetentionRepository retentionRepository;
  private final DailyWeatherRecordRepository dailyRecordRepository;
  private final ConfigurationCache configurationCache;
  private final AstronomySearch astronomySearch;

  @Scheduled(fixedRate = 5, timeUnit = TimeUnit.MINUTES)
  public void rollUpAndCleanData() {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();
    LocalTime now = LocalTime.now(zoneId);

    if (now.isBefore(MAINTENANCE_WINDOW_START) || now.isAfter(MAINTENANCE_WINDOW_END)) {
      return;
    }

    LocalDate today = LocalDate.now(zoneId);
    Instant cutoff = today.minusDays(RAW_RETENTION_DAYS).atStartOfDay(zoneId).toInstant();

    retentionRepository.rollupHourly(cutoff, CALM_THRESHOLD_MS, MIN_DIRECTION_CONSISTENCY);

    // Every complete day still covered by raw data is recomputed, not just yesterday. The rollups
    // are upserts, so this makes the tables self-healing: downtime, a late reading, or a newly
    // added column is repaired on the next run rather than needing a one-off backfill. Dates whose
    // raw rows have already been deleted aggregate to nothing and are left untouched.
    for (LocalDate date = today.minusDays(RAW_RETENTION_DAYS);
        date.isBefore(today);
        date = date.plusDays(1)) {
      rollupDay(date, zoneId);
    }

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

    // Checked against the FULL row specifically. "Any row exists" would let a run that wrote FULL
    // but died before DAY/NIGHT mark the date as done, leaving it permanently half-rolled-up.
    if (dailyRecordRepository.findByDateAndPeriod(yesterday, DayPeriod.FULL).isPresent()) {
      log.debug("Daily summary for {} already exists, skipping midnight generation", yesterday);
      return;
    }

    rollupDay(yesterday, zoneId);
    log.info("Generated daily summary for {}", yesterday);
  }

  /**
   * Writes the FULL row for a date, plus DAY and NIGHT when the sun actually crosses the horizon
   * that day. Under polar conditions there is no boundary to split on, so only FULL is written and
   * the day/night rows stay absent — which readers already have to handle, since every date rolled
   * up before the split has FULL alone.
   */
  private void rollupDay(LocalDate date, ZoneId zoneId) {
    Instant dayStart = date.atStartOfDay(zoneId).toInstant();
    Instant dayEnd = date.plusDays(1).atStartOfDay(zoneId).toInstant();

    // FULL is the plain local day and needs no solar boundary, so it is written unconditionally —
    // it is the row that still exists for polar dates and for everything rolled up before the
    // split.
    retentionRepository.rollupDailyPeriod(date, DayPeriod.FULL.name(), dayStart, dayEnd);

    DayPeriodInterval nightInterval =
        astronomySearch.getDayPeriodIntervalByDate(date, DayPeriod.NIGHT);
    DayPeriodInterval dayInterval = astronomySearch.getDayPeriodIntervalByDate(date, DayPeriod.DAY);

    if (nightInterval == null
        || dayInterval == null
        || !nightInterval.isValid()
        || !dayInterval.isValid()) {
      log.debug("No full day periods were found for date {}, writing only FULL day", date);
      return;
    }

    retentionRepository.rollupDailyPeriod(
        date,
        DayPeriod.NIGHT.name(),
        nightInterval.start().toInstant(),
        nightInterval.end().toInstant());

    retentionRepository.rollupDailyPeriod(
        date, DayPeriod.DAY.name(), dayInterval.start().toInstant(), dayInterval.end().toInstant());
  }
}
