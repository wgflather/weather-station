package com.flather.weatherstation.service;

import static com.flather.weatherstation.util.TimeUtil.toTime;
import static com.flather.weatherstation.util.TimeUtil.toZoned;

import com.flather.weatherstation.domain.constant.DailyCurveResolution;
import com.flather.weatherstation.dto.astronomy.*;
import io.github.cosinekitty.astronomy.Body;
import io.github.cosinekitty.astronomy.Direction;
import io.github.cosinekitty.astronomy.IlluminationInfo;
import io.github.cosinekitty.astronomy.Time;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

/**
 * Composes dashboard-facing snapshots and daily-event DTOs from the raw lookups in {@link
 * AstronomyEngine}. Owns: DTO assembly for {@link SunSnapshot} / {@link MoonSnapshot} / {@link
 * SunDailyEvents} / {@link MoonDailyEvents} / {@link SunTimesDto}, twilight-altitude thresholds,
 * display rounding, polar-condition classification, the Spring caching strategy keyed by {@link
 * #dailyKey()}, and altitude-curve downsampling via {@link #getLowResPoints}.
 *
 * <p>Contains no direct calls into the cosinekitty library — every position, illumination, or event
 * search is delegated to {@link AstronomyEngine}.
 */
@Service
@RequiredArgsConstructor
public class AstronomySearch {

  // Altitude thresholds (degrees below the horizon) that define each twilight boundary.
  private static final double HORIZON_DEG = 0.0;
  private static final double CIVIL_TWILIGHT_DEG = -6.0;
  private static final double NAUTICAL_TWILIGHT_DEG = -12.0;
  private static final double ASTRONOMICAL_TWILIGHT_DEG = -18.0;

  private final AstronomyEngine engine;

  // ────────────────────────────────────────────────────────────────────────────
  // PUBLIC API — high-level snapshots
  // ────────────────────────────────────────────────────────────────────────────

  /** Live solar state at the given moment (currently just the sun's altitude). */
  public SunSnapshot getSunSnapshot(ZonedDateTime time) {
    double currentAlt = round2(engine.altitude(Body.Sun, engine.observer(), toTime(time)));
    return new SunSnapshot(currentAlt);
  }

  /** Today's solar events: rise/set, solar noon transit, twilight times, day/night length. */
  @Cacheable(value = "sunDailyEvents", key = "#root.target.dailyKey()")
  public SunDailyEvents getSunDailyEvents() {
    ZonedDateTime sunRise = engine.calculateRiseSet(Body.Sun, Direction.Rise);
    ZonedDateTime sunSet = engine.calculateRiseSet(Body.Sun, Direction.Set);
    TransitDto solarNoon = roundTransit(engine.getBodyPeakAltitude(Body.Sun));
    SunTimesDto sunTimes = getSunTimesDto();
    long dayLength = getDayDuration();
    long nightLength = getNightLength();
    List<AstronomyPoint> sunCurve = engine.generateWholeDayCurve(Body.Sun);

    return new SunDailyEvents(
        sunRise, sunSet, solarNoon, sunTimes, dayLength, nightLength, sunCurve);
  }

  /**
   * Thins a full-resolution altitude curve by keeping every {@code step}-th point. The first point
   * is always included; the last may be dropped if {@code points.size()} is not divisible by {@code
   * step} — acceptable for display use.
   */
  private List<AstronomyPoint> downsample(List<AstronomyPoint> points, int step) {
    List<AstronomyPoint> downsampledPoints = new ArrayList<>();
    for (int i = 0; i < points.size(); i += step) {
      downsampledPoints.add(points.get(i));
    }
    return downsampledPoints;
  }

  private List<AstronomyPoint> getFullResPoints(CelestialBody body) {
    return switch (body) {
      case SUN -> getSunDailyEvents().sunCurve();
      case MOON -> getMoonDailyEvents().moonCurve();
    };
  }

  /**
   * Returns the altitude curve for the given body at the requested resolution. The full
   * 1-minute-resolution curve is read from the daily-events cache (computed once per day), then
   * downsampled in-memory to the number of points implied by {@code resolution}.
   */
  private List<AstronomyPoint> getLowResPoints(
      CelestialBody body, DailyCurveResolution resolution) {
    return downsample(getFullResPoints(body), resolution.getStepSize());
  }

  /** Returns the altitude curve for the given body and resolution, wrapped with metadata. */
  public AstronomyCurveDto getPoints(CelestialBody body, DailyCurveResolution resolution) {
    List<AstronomyPoint> points =
        switch (resolution) {
          case CARD -> getLowResPoints(body, resolution);
          case FULL_CHART -> getFullResPoints(body);
        };
    return new AstronomyCurveDto(body, resolution, points);
  }

  /**
   * Returns the altitude curve for {@code daysOffset} days from today. Offset 0 delegates to the
   * cached {@link #getPoints}; positive offsets compute fresh curves without caching (called only
   * on modal open, not on the main polling loop).
   */
  public AstronomyCurveDto getPointsForOffset(
      CelestialBody body, DailyCurveResolution resolution, int daysOffset) {
    if (daysOffset == 0) {
      return getPoints(body, resolution);
    }
    LocalDate date = LocalDate.now(engine.zoneId()).plusDays(daysOffset);
    List<AstronomyPoint> all = engine.generateCurveForDate(body.toLibraryBody(), date);
    List<AstronomyPoint> points =
        resolution == DailyCurveResolution.FULL_CHART
            ? all
            : downsample(all, resolution.getStepSize());
    return new AstronomyCurveDto(body, resolution, points);
  }

  /** Live lunar state at the given moment: altitude, distance, phase, constellation. */
  public MoonSnapshot getMoonSnapshot(ZonedDateTime time) {
    double currentAlt = round2(engine.altitude(Body.Moon, engine.observer(), toTime(time)));
    double moonDistanceKm = round2(convertAuToKm(engine.getObjectDistance(Body.Moon)));
    String constellation = engine.getMoonConstellation();

    // Phase angle (0°–360°): 0° = new moon, 90° = first quarter, 180° = full, 270° = last quarter.
    double phaseDegrees = engine.getMoonPhaseDegrees(time);

    IlluminationInfo info = engine.getMoonIllumination(time);
    double phasePercentage = round2(getMoonPhasePercentage(info.getPhaseFraction()));
    double moonAgeDays = round2(getMoonAgeDays(phaseDegrees));
    String phaseName = getPhaseName(phaseDegrees);
    MoonPhase moonPhase = new MoonPhase(phasePercentage, moonAgeDays, phaseName);

    return new MoonSnapshot(currentAlt, moonDistanceKm, moonPhase, constellation);
  }

  /** Today's lunar events: rise, set, and the peak (transit) of the moon. */
  @Cacheable(value = "moonDailyEvents", key = "#root.target.dailyKey()")
  public MoonDailyEvents getMoonDailyEvents() {
    ZonedDateTime moonRise = engine.calculateRiseSet(Body.Moon, Direction.Rise);
    ZonedDateTime moonSet = engine.calculateRiseSet(Body.Moon, Direction.Set);
    TransitDto moonPeak = roundTransit(engine.getBodyPeakAltitude(Body.Moon));
    List<AstronomyPoint> moonCurve = engine.generateWholeDayCurve(Body.Moon);

    return new MoonDailyEvents(moonRise, moonSet, moonPeak, moonCurve);
  }

  /** Returns a copy of the transit with its altitude rounded to two decimal places. */
  private static TransitDto roundTransit(TransitDto transit) {
    return new TransitDto(round2(transit.alt()), transit.time());
  }

  /**
   * Cache key for the "daily events" caches: today's date in the currently-configured zone, plus
   * the zone id itself. Recomputed on every cache lookup, so a zone change at runtime — or the
   * clock rolling past midnight — produces a fresh key and triggers recomputation. Must be public
   * for the SpEL expression {@code #root.target.dailyKey()} to invoke it through the Spring proxy.
   */
  public String dailyKey() {
    ZoneId zone = engine.zoneId();
    return LocalDate.now(zone) + "@" + zone.getId();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // SUN — twilight transitions, day length, night length
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Computes every solar transition for today: astronomical / nautical / civil dawn, sunrise,
   * sunset, and the same set in reverse for dusk. Sunrise and sunset are nulled out in polar
   * conditions (see {@link SolarCondition}).
   */
  public SunTimesDto getSunTimesDto() {
    ZoneId zone = engine.zoneId();

    // ── DAWN / RISING TRANSITIONS ──────────────────────────────────────────
    Time astronomicalNightEnd =
        engine.searchAltitudeRaw(Body.Sun, Direction.Set, ASTRONOMICAL_TWILIGHT_DEG);
    ZonedDateTime nauticalDawn =
        engine.findWhenAtAltitude(Body.Sun, Direction.Rise, NAUTICAL_TWILIGHT_DEG);
    ZonedDateTime civilDawn =
        engine.findWhenAtAltitude(Body.Sun, Direction.Rise, CIVIL_TWILIGHT_DEG);
    Time sunriseAstroTime = engine.searchAltitudeRaw(Body.Sun, Direction.Rise, HORIZON_DEG);

    // ── DUSK / SETTING TRANSITIONS ─────────────────────────────────────────
    Time sunsetAstroTime = engine.searchAltitudeRaw(Body.Sun, Direction.Set, HORIZON_DEG);
    ZonedDateTime civilDusk =
        engine.findWhenAtAltitude(Body.Sun, Direction.Set, CIVIL_TWILIGHT_DEG);
    ZonedDateTime nauticalDusk =
        engine.findWhenAtAltitude(Body.Sun, Direction.Set, NAUTICAL_TWILIGHT_DEG);
    Time astronomicalNightStart =
        engine.searchAltitudeRaw(Body.Sun, Direction.Set, ASTRONOMICAL_TWILIGHT_DEG);

    // Sunrise/sunset are only meaningful when the sun actually crosses the horizon today.
    double noonAlt = engine.getBodyPeakAltitude(Body.Sun).alt();
    SolarCondition solarCondition = resolveSunCondition(sunriseAstroTime, sunsetAstroTime, noonAlt);

    ZonedDateTime sunrise;
    ZonedDateTime sunset;
    if (solarCondition == SolarCondition.NORMAL) {
      sunrise = toZoned(sunriseAstroTime, zone);
      sunset = toZoned(sunsetAstroTime, zone);
    } else {
      sunrise = null;
      sunset = null;
    }

    ZonedDateTime astronomicalNightStartZoned =
        astronomicalNightStart != null ? toZoned(astronomicalNightStart, zone) : null;
    ZonedDateTime astronomicalNightEndZoned =
        astronomicalNightEnd != null ? toZoned(astronomicalNightEnd, zone) : null;

    return new SunTimesDto(
        astronomicalNightEndZoned,
        nauticalDawn,
        civilDawn,
        sunrise,
        sunset,
        civilDusk,
        nauticalDusk,
        astronomicalNightStartZoned,
        solarCondition);
  }

  /** Length of today's day from sunrise to sunset, in seconds. */
  public long getDayDuration() {
    ZonedDateTime sunriseTime = engine.findWhenAtAltitude(Body.Sun, Direction.Rise, HORIZON_DEG);
    ZonedDateTime sunsetTime = engine.findWhenAtAltitude(Body.Sun, Direction.Set, HORIZON_DEG);
    Duration duration = Duration.between(sunriseTime, sunsetTime);
    return duration.getSeconds();
  }

  /**
   * Length of true astronomical night (sun below -18°), in seconds. Handles polar edge cases:
   * returns 0 for polar day, and a full day for polar night.
   */
  public long getNightLength() {
    ZoneId zone = engine.zoneId();

    Time nightStart = engine.searchAltitudeRaw(Body.Sun, Direction.Set, ASTRONOMICAL_TWILIGHT_DEG);
    Time nightEnd = engine.searchAltitudeRaw(Body.Sun, Direction.Rise, ASTRONOMICAL_TWILIGHT_DEG);

    // Polar day — sun never drops below -18°.
    if (nightStart == null && nightEnd == null) {
      return 0;
    }

    // Sun never goes below -18° before midnight reference shift; measure from start of day
    // up to the moment the sun finally rises through -18°.
    if (nightStart == null) {
      ZonedDateTime night = toZoned(nightEnd, zone);
      return Duration.between(LocalDate.now(zone).atStartOfDay(zone), night).getSeconds();
    }

    // Sun never climbs back above -18° — night runs for the full 24 hours.
    if (nightEnd == null) {
      return Duration.ofDays(1).getSeconds();
    }

    ZonedDateTime nightStartZoned = toZoned(nightStart, zone);
    ZonedDateTime nightEndZoned = toZoned(nightEnd, zone);
    return Duration.between(nightStartZoned, nightEndZoned).getSeconds();
  }

  /**
   * Classifies the day as normal or polar. When no sunrise/sunset is found, the sign of the sun's
   * noon altitude tells us whether the sun is permanently up (polar day) or down (polar night).
   */
  private SolarCondition resolveSunCondition(
      Time sunriseAstroTime, Time sunsetAstroTime, double noonAlt) {
    if (sunriseAstroTime == null && sunsetAstroTime == null) {
      return noonAlt > 0 ? SolarCondition.POLAR_DAY : SolarCondition.POLAR_NIGHT;
    }
    return SolarCondition.NORMAL;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ASTRONOMY MATH — inlined from the former AstroUtil class; no dependencies
  // ────────────────────────────────────────────────────────────────────────────

  private static final double LUNAR_CYCLE_DAYS = 29.53059;
  private static final double AU_TO_KM = 149_597_870.7;

  private static double convertAuToKm(double au) {
    return au * AU_TO_KM;
  }

  private static double round2(double value) {
    return Math.round(value * 100.0) / 100.0;
  }

  private static double getMoonPhasePercentage(double phaseDegrees) {
    return phaseDegrees * 100.0;
  }

  private static double getMoonAgeDays(double phaseDegrees) {
    return (phaseDegrees / 360.0) * LUNAR_CYCLE_DAYS;
  }

  /**
   * Maps a lunar phase angle (degrees) to a human-readable name. The 360° cycle is divided into 8
   * named regions centred on the four cardinal phases, with a ±10° tolerance around each cardinal.
   */
  private static String getPhaseName(double degrees) {
    degrees = (degrees % 360 + 360) % 360;
    if (degrees < 10 || degrees > 350) return "New Moon";
    if (degrees < 80) return "Waxing Crescent";
    if (degrees < 100) return "First Quarter";
    if (degrees < 170) return "Waxing Gibbous";
    if (degrees < 190) return "Full Moon";
    if (degrees < 260) return "Waning Gibbous";
    if (degrees < 280) return "Last Quarter";
    return "Waning Crescent";
  }
}
