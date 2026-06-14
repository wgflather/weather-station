package com.flather.weatherstation.service;

import static com.flather.weatherstation.util.TimeUtil.toTime;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.dto.astronomy.AstronomyPoint;
import com.flather.weatherstation.dto.astronomy.TransitDto;
import io.github.cosinekitty.astronomy.Aberration;
import io.github.cosinekitty.astronomy.Astronomy;
import io.github.cosinekitty.astronomy.Body;
import io.github.cosinekitty.astronomy.Direction;
import io.github.cosinekitty.astronomy.EquatorEpoch;
import io.github.cosinekitty.astronomy.Equatorial;
import io.github.cosinekitty.astronomy.HourAngleInfo;
import io.github.cosinekitty.astronomy.IlluminationInfo;
import io.github.cosinekitty.astronomy.Observer;
import io.github.cosinekitty.astronomy.Refraction;
import io.github.cosinekitty.astronomy.Time;
import io.github.cosinekitty.astronomy.Topocentric;

import java.time.*;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * Thin wrappers around the cosinekitty astronomy library. Handles position lookups, illumination,
 * event searches, and whole-day altitude curve generation. Returns library-native types
 * (Equatorial, Topocentric, IlluminationInfo), primitives, TransitDto, or AstronomyPoint — no
 * business-level rounding, polar-condition classification, or caching happens here. {@link
 * AstronomySearch} composes these lookups into the dashboard-facing snapshots and daily-event
 * records.
 */
@Service
@RequiredArgsConstructor
public class AstronomyEngine {

  // Search window passed to the astronomy library: scan one day forward from the start instant.
  private static final int SEARCH_LIMIT_DAYS = 1;

  private final ConfigurationCache configurationCache;

  // ────────────────────────────────────────────────────────────────────────────
  // POSITION & ILLUMINATION
  // ────────────────────────────────────────────────────────────────────────────

  /** Equatorial coordinates (RA / Dec / distance) for a body at "now", referenced to J2000. */
  public Equatorial getObjectEquatorialCoords(Body body) {
    Time time = toTime(ZonedDateTime.now());
    return Astronomy.equator(body, time, observer(), EquatorEpoch.J2000, Aberration.Corrected);
  }

  public Equatorial getObjectEquatorialCoords(Body body, Time time) {
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

    return new TransitDto(info.getHor().getAltitude(), toZoned(info.getTime()));
  }

  /** Lunar illumination snapshot (phase fraction, magnitude, etc.) from the astronomy library. */
  public IlluminationInfo getMoonIllumination(ZonedDateTime time) {
    return Astronomy.illumination(Body.Moon, toTime(time));
  }

  /**
   * Moon phase angle in degrees: 0° = new moon, 90° = first quarter, 180° = full, 270° = last
   * quarter. The library returns this in the [0, 360) range.
   */
  public double getMoonPhaseDegrees(ZonedDateTime time) {
    return Astronomy.moonPhase(toTime(time));
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
  // EVENT SEARCHES
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Raw library search for the next moment today the body crosses a given altitude in the given
   * direction. Returns {@code null} when no event exists in the search window — callers that need
   * to detect polar conditions read this directly; callers that treat absence as an error should
   * use {@link #findWhenAtAltitude} instead.
   */
  public Time searchAltitudeRaw(Body body, Direction direction, double altitudeDeg) {
    return Astronomy.searchAltitude(
        body, observer(), direction, todayMidnight(), SEARCH_LIMIT_DAYS, altitudeDeg);
    Astronomy.illumination()
  }

  /**
   * Finds the next moment today the given body reaches the target altitude in the given direction.
   * Throws if no such event exists within the search window (e.g. polar conditions).
   */
  public ZonedDateTime findWhenAtAltitude(Body body, Direction direction, double altitudeDeg) {
    return Optional.ofNullable(searchAltitudeRaw(body, direction, altitudeDeg))
        .map(this::toZoned)
        .orElseThrow(() -> new IllegalStateException("No altitude event found for " + body));
  }

  /** Altitude and local time of a body at the given instant. Reuses {@link #getBodyPosition}. */
  public AstronomyPoint pointAt(Body body, Time time) {
    double alt = getBodyPosition(body, observer(), time).getAltitude();
    return new AstronomyPoint(toZoned(time), alt);
  }



  /**
   * Samples the body's altitude every minute from midnight to midnight (inclusive), producing
   * 1441 points on standard days. DST transitions shift the count by ±60. The full-resolution
   * list is stored in the daily-events cache; callers that need fewer points should downsample
   * via {@link AstronomySearch#downsample}.
   */
  public List<AstronomyPoint> generateWholeDayCurve(Body body) {
    ZoneId zone = zoneId();
    ZonedDateTime todayStart = LocalDate.now(zone).atStartOfDay(zone);
    ZonedDateTime todayEnd = LocalDate.now(zone).plusDays(1).atStartOfDay(zone);

    List<AstronomyPoint> curve = new ArrayList<>();

    long dayDuration = Duration.between(todayStart, todayEnd).toMinutes();

    for (int i = 0; i <= dayDuration; i++) {
      Time time = toTime(todayStart.plusMinutes(i));
      curve.add(pointAt(body, time));
    }

    return curve;
  }



  /**
   * Finds the next true rise or set today using the library's rise/set search, which accounts for
   * atmospheric refraction and the body's angular radius — this differs from "altitude crosses 0°"
   * geometric search. Throws if no event exists (polar conditions).
   */
  public ZonedDateTime calculateRiseSet(Body body, Direction direction) {
    Time foundTime =
        Astronomy.searchRiseSet(body, observer(), direction, todayMidnight(), SEARCH_LIMIT_DAYS);
    return Optional.ofNullable(foundTime)
        .map(this::toZoned)
        .orElseThrow(() -> new IllegalStateException("No altitude event found for " + body));
  }

  // ────────────────────────────────────────────────────────────────────────────
  // LOCATION CONTEXT (exposed so composers can do their own time math)
  // ────────────────────────────────────────────────────────────────────────────

  public Observer observer() {
    return configurationCache.getLocationContext().observer();
  }

  public ZoneId zoneId() {
    return configurationCache.getLocationContext().zoneId();
  }

  /** Library {@link Time} representing midnight today in the observer's zone. */
  public Time todayMidnight() {
    ZoneId zone = zoneId();
    return toTime(ZonedDateTime.of(LocalDate.now(zone), LocalTime.MIDNIGHT, zone));
  }

  /** Convert a library {@link Time} to a {@link ZonedDateTime} in the observer's zone. */
  public ZonedDateTime toZoned(Time time) {
    return com.flather.weatherstation.util.TimeUtil.toZoned(time, zoneId());
  }
}
