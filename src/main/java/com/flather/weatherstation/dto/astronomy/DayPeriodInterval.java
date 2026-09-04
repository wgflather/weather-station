package com.flather.weatherstation.dto.astronomy;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.Duration;
import java.time.ZonedDateTime;

/**
 * A half-open window between two solar events — sunrise→sunset for a daylight period, or the
 * previous day's sunset→this day's sunrise for a night, which is why a night's {@code start} falls
 * on the calendar date before its {@code end}.
 */
public record DayPeriodInterval(ZonedDateTime start, ZonedDateTime end) {

  /**
   * Whether this window describes a real period. Both ends are absent under polar conditions, and
   * near the polar circles a sunset resolved just after midnight can pair with the next sunrise
   * into a "night" spanning a whole daylight period — hence the 24-hour ceiling.
   *
   * <p>Not serialized: callers only ever receive windows that already passed this check.
   */
  @JsonIgnore
  public boolean isValid() {
    return start != null
        && end != null
        && Duration.between(start, end).toHours() < 24
        && start.isBefore(end);
  }
}
