package com.flather.weatherstation.util;

import java.time.*;

/** Helper class for calculating start and end times for date/time ranges. */
public class DateRangeHelper {

  /**
   * Gets the start of the current date in the specified timezone.
   *
   * @param zoneId The timezone ID (e.g., "America/New_York")
   * @return Instant representing start of the current date
   */
  public static Instant getStartOfDay(ZoneId zoneId) {
    LocalDate currentDate = LocalDate.now(zoneId);
    return currentDate.atStartOfDay(zoneId).toInstant();
  }

  /**
   * Gets the end of the current date in the specified timezone.
   *
   * @param zoneId The timezone ID (e.g., "America/New_York")
   * @return Instant representing end of the current date
   */
  public static Instant getEndOfDay(ZoneId zoneId) {
    LocalDate currentDate = LocalDate.now(zoneId);
    return currentDate.plusDays(1).atStartOfDay(zoneId).toInstant();
  }

  public static DateRange getDateRange(ZoneId zoneId) {
    return new DateRange(getStartOfDay(zoneId), getEndOfDay(zoneId));
  }

  /** Helper class to hold start and end times for a date range. */
  public record DateRange(Instant startTime, Instant endTime) {}
}
