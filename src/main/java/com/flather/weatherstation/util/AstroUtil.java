package com.flather.weatherstation.util;

/**
 * Astronomy-related conversions and naming utilities. Holds pure math helpers that derive
 * presentation values (phase percent, moon age, phase name) from raw astronomy-library outputs.
 */
public class AstroUtil {

  /** Synodic month — average number of days from one new moon to the next. */
  private static final double LUNAR_CYCLE_DAYS = 29.53059;

  /** One astronomical unit expressed in kilometres (mean Earth–Sun distance). */
  private static final double AU_TO_KM = 149_597_870.7;

  /** Converts a distance in astronomical units to kilometres. */
  public static double convertAuToKm(double au) {
    return au * AU_TO_KM;
  }

  /** Rounds a value to two decimal places for display-friendly numeric output. */
  public static double round2(double value) {
    return Math.round(value * 100.0) / 100.0;
  }

  // =========================================================
  // MOON PHASE CORE
  // =========================================================

  /**
   * Converts the library's phase fraction (0.0–1.0, where 0 = new moon and 1 = full moon) into a
   * percentage in the range 0–100.
   */
  public static double getMoonPhasePercentage(double phaseDegrees) {
    return phaseDegrees * 100.0;
  }

  /**
   * Converts a phase angle in degrees (0–360, where 0 = new moon) into the moon's age in days
   * within the ~29.53-day synodic cycle.
   */
  public static double getMoonAgeDays(double phaseDegrees) {
    return (phaseDegrees / 360.0) * LUNAR_CYCLE_DAYS;
  }

  /** Convenience alias for {@link #getPhaseName(double)}. */
  public static String getMoonPhaseName(double phaseDegrees) {
    return getPhaseName(phaseDegrees);
  }

  // =========================================================
  // PHASE NAME MAPPING
  // =========================================================

  /**
   * Maps a lunar phase angle (degrees) to a human-readable name. The 360° cycle is divided into 8
   * named regions centred on the four cardinal phases (new, first quarter, full, last quarter),
   * with a ±10° tolerance around each cardinal angle.
   */
  public static String getPhaseName(double degrees) {

    // Normalize to 0–360 (handles negative input from the library).
    degrees = (degrees % 360 + 360) % 360;

    if (degrees < 10 || degrees > 350) {
      return "New Moon";
    }

    if (degrees < 80) {
      return "Waxing Crescent";
    }

    if (degrees < 100) {
      return "First Quarter";
    }

    if (degrees < 170) {
      return "Waxing Gibbous";
    }

    if (degrees < 190) {
      return "Full Moon";
    }

    if (degrees < 260) {
      return "Waning Gibbous";
    }

    if (degrees < 280) {
      return "Last Quarter";
    }

    return "Waning Crescent";
  }
}
