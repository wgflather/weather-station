package com.flather.weatherstation.dto.astronomy;

/**
 * Classifies the sun's daily behaviour at the observer's location, used to disambiguate cases where
 * no sunrise/sunset event exists for the day (high-latitude polar conditions).
 */
public enum SolarCondition {
  /** Standard cycle — the sun crosses the horizon at least once during the day. */
  NORMAL,

  /** Midnight sun: the sun stays above the horizon for the full day (high-latitude summer). */
  POLAR_DAY,

  /** Polar night: the sun never rises above the horizon (high-latitude winter). */
  POLAR_NIGHT
}
