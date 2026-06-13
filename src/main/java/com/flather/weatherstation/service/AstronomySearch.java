package com.flather.weatherstation.service;

import static com.flather.weatherstation.util.AstroUtil.*;
import static com.flather.weatherstation.util.TimeUtil.toTime;
import static com.flather.weatherstation.util.TimeUtil.toZoned;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.domain.constant.SolarCondition;
import com.flather.weatherstation.dto.astronomy.*;
import io.github.cosinekitty.astronomy.*;
import java.time.*;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

/**
 * Computes solar and lunar positions, rise/set events, and twilight transitions for the configured
 * observer location. Wraps the cosinekitty astronomy library and converts results to the observer's
 * local time zone.
 */
@Service
@RequiredArgsConstructor
public class AstronomySearch {

  // Altitude thresholds (degrees below the horizon) that define each twilight boundary.
  private static final double HORIZON_DEG = 0.0;
  private static final double CIVIL_TWILIGHT_DEG = -6.0;
  private static final double NAUTICAL_TWILIGHT_DEG = -12.0;
  private static final double ASTRONOMICAL_TWILIGHT_DEG = -18.0;

  // Search window passed to the astronomy library: scan one day forward from the start instant.
  private static final int SEARCH_LIMIT_DAYS = 1;

  private final ConfigurationCache configurationCache;

  // ────────────────────────────────────────────────────────────────────────────
  // PUBLIC API — high-level snapshots
  // ────────────────────────────────────────────────────────────────────────────

  /** Live solar state at the given moment (currently just the sun's altitude). */
  public SunSnapshot getSunSnapshot(ZonedDateTime time) {
    double currentAlt = round2(altitude(Body.Sun, observer(), toTime(time)));
    return new SunSnapshot(currentAlt);
  }

  /** Today's solar events: rise/set, solar noon transit, twilight times, day/night length. */
  @Cacheable(value = "sunDailyEvents", key = "#root.target.dailyKey()")
  public SunDailyEvents getSunDailyEvents() {
    ZonedDateTime sunRise = calculateRiseSet(Body.Sun, Direction.Rise);
    ZonedDateTime sunSet = calculateRiseSet(Body.Sun, Direction.Set);
    TransitDto solarNoon = roundTransit(getBodyPeakAltitude(Body.Sun));
    SunTimesDto sunTimes = getSunTimesDto();
    long dayLength = getDayDuration();
    long nightLength = getNightLength();

    return new SunDailyEvents(sunRise, sunSet, solarNoon, sunTimes, dayLength, nightLength);
  }

  /** Live lunar state at the given moment: altitude, distance, phase, constellation. */
  public MoonSnapshot getMoonSnapshot(ZonedDateTime time) {
    double currentAlt = round2(altitude(Body.Moon, observer(), toTime(time)));
    double moonDistanceKm = round2(convertAuToKm(getObjectDistance(Body.Moon)));
    String constellation = getMoonConstellation();

    // Phase angle (0°–360°): 0° = new moon, 90° = first quarter, 180° = full, 270° = last quarter.
    double phaseDegrees = Astronomy.moonPhase(toTime(time));

    IlluminationInfo info = getMoonIllumination(time);
    double phasePercentage = round2(getMoonPhasePercentage(info.getPhaseFraction()));
    double moonAgeDays = round2(getMoonAgeDays(phaseDegrees));
    String phaseName = getPhaseName(phaseDegrees);
    MoonPhase moonPhase = new MoonPhase(phasePercentage, moonAgeDays, phaseName);

    return new MoonSnapshot(currentAlt, moonDistanceKm, moonPhase, constellation);
  }

  /** Today's lunar events: rise, set, and the peak (transit) of the moon. */
  @Cacheable(value = "moonDailyEvents", key = "#root.target.dailyKey()")
  public MoonDailyEvents getMoonDailyEvents() {
    ZonedDateTime moonRise = calculateRiseSet(Body.Moon, Direction.Rise);
    ZonedDateTime moonSet = calculateRiseSet(Body.Moon, Direction.Set);
    TransitDto moonPeak = roundTransit(getBodyPeakAltitude(Body.Moon));

    return new MoonDailyEvents(moonRise, moonSet, moonPeak);
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
    ZoneId zone = zoneId();
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
    ZoneId zone = zoneId();
    Observer observer = observer();
    Time start = todayMidnight(zone);

    // ── DAWN / RISING TRANSITIONS ──────────────────────────────────────────
    Time astronomicalNightEnd =
        Astronomy.searchAltitude(
            Body.Sun, observer, Direction.Set, start, SEARCH_LIMIT_DAYS, ASTRONOMICAL_TWILIGHT_DEG);
    ZonedDateTime nauticalDawn =
        findWhenAtAltitude(Body.Sun, Direction.Rise, NAUTICAL_TWILIGHT_DEG);
    ZonedDateTime civilDawn = findWhenAtAltitude(Body.Sun, Direction.Rise, CIVIL_TWILIGHT_DEG);
    Time sunriseAstroTime =
        Astronomy.searchAltitude(
            Body.Sun, observer, Direction.Rise, start, SEARCH_LIMIT_DAYS, HORIZON_DEG);

    // ── DUSK / SETTING TRANSITIONS ─────────────────────────────────────────
    Time sunsetAstroTime =
        Astronomy.searchAltitude(
            Body.Sun, observer, Direction.Set, start, SEARCH_LIMIT_DAYS, HORIZON_DEG);
    ZonedDateTime civilDusk = findWhenAtAltitude(Body.Sun, Direction.Set, CIVIL_TWILIGHT_DEG);
    ZonedDateTime nauticalDusk = findWhenAtAltitude(Body.Sun, Direction.Set, NAUTICAL_TWILIGHT_DEG);
    Time astronomicalNightStart =
        Astronomy.searchAltitude(
            Body.Sun, observer, Direction.Set, start, SEARCH_LIMIT_DAYS, ASTRONOMICAL_TWILIGHT_DEG);

    // Sunrise/sunset are only meaningful when the sun actually crosses the horizon today.
    double noonAlt = getBodyPeakAltitude(Body.Sun).alt();
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
    ZonedDateTime sunriseTime = findWhenAtAltitude(Body.Sun, Direction.Rise, HORIZON_DEG);
    ZonedDateTime sunsetTime = findWhenAtAltitude(Body.Sun, Direction.Set, HORIZON_DEG);
    Duration duration = Duration.between(sunsetTime, sunriseTime);
    return duration.getSeconds();
  }

  /**
   * Length of true astronomical night (sun below -18°), in seconds. Handles polar edge cases:
   * returns 0 for polar day, and a full day for polar night.
   */
  public long getNightLength() {
    ZoneId zone = zoneId();
    Observer observer = observer();
    Time start = todayMidnight(zone);

    Time nightStart =
        Astronomy.searchAltitude(
            Body.Sun, observer, Direction.Set, start, SEARCH_LIMIT_DAYS, ASTRONOMICAL_TWILIGHT_DEG);
    Time nightEnd =
        Astronomy.searchAltitude(
            Body.Sun,
            observer,
            Direction.Rise,
            start,
            SEARCH_LIMIT_DAYS,
            ASTRONOMICAL_TWILIGHT_DEG);

    // Polar day — sun never drops below -18°.
    if (nightStart == null && nightEnd == null) {
      return 0;
    }

    // Sun never goes below -18° before midnight reference shift; measure from start of day
    // up to the moment the sun finally rises through -18°.
    if (nightStart == null) {
      ZonedDateTime night = toZoned(nightEnd, zone);
      return Duration.between(LocalDate.now().atStartOfDay(night.getZone()), night).getSeconds();
    }

    // Sun never climbs back above -18° — night runs for the full 24 hours.
    if (nightEnd == null) {
      return Duration.ofDays(1).getSeconds();
    }

    ZonedDateTime nightStartZoned = toZoned(nightStart, zone);
    ZonedDateTime nightEndZoned = toZoned(nightEnd, zone);
    return Duration.between(nightStartZoned, nightEndZoned).getSeconds();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // MOON & GENERIC BODY HELPERS
  // ────────────────────────────────────────────────────────────────────────────

  /** Equatorial coordinates (RA / Dec / distance) for a body at "now", referenced to J2000. */
  public Equatorial getObjectEquatorialCoords(Body body) {
    Time time = toTime(ZonedDateTime.now());
    return Astronomy.equator(body, time, observer(), EquatorEpoch.J2000, Aberration.Corrected);
  }

  /** Name of the constellation the moon is currently inside. */
  public String getMoonConstellation() {
    Equatorial equ = getObjectEquatorialCoords(Body.Moon);
    return Astronomy.constellation(equ.getRa(), equ.getDec()).getName();
  }

  /** Today's transit (highest point) of the given body: peak altitude in degrees plus time. */
  public TransitDto getBodyPeakAltitude(Body body) {
    ZoneId zone = zoneId();
    Time start = toTime(LocalDate.now().atStartOfDay(zone));

    HourAngleInfo info =
        Astronomy.searchHourAngle(body, observer(), 0.0, start, Direction.Rise.getSign());

    return new TransitDto(info.getHor().getAltitude(), toZoned(info.getTime(), zone));
  }

  /** Lunar illumination snapshot (phase fraction, magnitude, etc.) from the astronomy library. */
  public static IlluminationInfo getMoonIllumination(ZonedDateTime time) {
    return Astronomy.illumination(Body.Moon, toTime(time));
  }

  /** Topocentric horizontal coordinates (azimuth / altitude) of a body, refraction-corrected. */
  public Topocentric getBodyPosition(Body body, Observer observer, Time time) {
    Equatorial equ =
        Astronomy.equator(body, time, observer, EquatorEpoch.J2000, Aberration.Corrected);
    return Astronomy.horizon(time, observer, equ.getRa(), equ.getDec(), Refraction.Normal);
  }

  /** Current altitude (degrees) of a body above the horizon. Negative when below. */
  public double altitude(Body body, Observer observer, Time time) {
    return getBodyPosition(body, observer, time).getAltitude();
  }

  /** Distance to a body in the raw unit returned by the astronomy library (astronomical units). */
  public double getObjectDistance(Body body) {
    return getObjectEquatorialCoords(body).getDist();
  }

  // ────────────────────────────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Finds the next moment today the given body reaches the target altitude in the given direction.
   * Throws if no such event exists within the search window (e.g. polar conditions).
   */
  private ZonedDateTime findWhenAtAltitude(Body body, Direction direction, double altitude) {
    ZoneId zone = zoneId();
    Time start = todayMidnight(zone);
    Time result =
        Astronomy.searchAltitude(body, observer(), direction, start, SEARCH_LIMIT_DAYS, altitude);

    return Optional.ofNullable(result)
        .map(r -> toZoned(r, zone))
        .orElseThrow(() -> new IllegalStateException("No altitude event found for " + body));
  }

  /**
   * Finds the next true rise or set today using the library's rise/set search, which accounts for
   * atmospheric refraction and the body's angular radius — this differs from "altitude crosses 0°"
   * geometric search. Throws if no event exists (polar conditions).
   */
  private ZonedDateTime calculateRiseSet(Body body, Direction direction) {
    ZoneId zone = zoneId();
    Time start = todayMidnight(zone);
    Time foundTime = Astronomy.searchRiseSet(body, observer(), direction, start, SEARCH_LIMIT_DAYS);

    return Optional.ofNullable(foundTime)
        .map(r -> toZoned(r, zone))
        .orElseThrow(() -> new IllegalStateException("No altitude event found for " + body));
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

  /** Library {@link Time} representing midnight today in the observer's zone. */
  private Time todayMidnight(ZoneId zone) {
    return toTime(ZonedDateTime.of(LocalDate.now(zone), LocalTime.MIDNIGHT, zone));
  }

  private Observer observer() {
    return configurationCache.getLocationContext().observer();
  }

  private ZoneId zoneId() {
    return configurationCache.getLocationContext().zoneId();
  }
}
