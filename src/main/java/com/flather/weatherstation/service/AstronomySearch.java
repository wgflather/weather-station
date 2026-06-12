package com.flather.weatherstation.service;

import static com.flather.weatherstation.util.TimeUtil.toTime;
import static com.flather.weatherstation.util.TimeUtil.toZoned;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.dto.astronomy.Moon;
import com.flather.weatherstation.dto.astronomy.Sun;
import io.github.cosinekitty.astronomy.*;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Optional;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AstronomySearch {
  private final ConfigurationCache configurationCache;

  private ZonedDateTime findWhenAtAltitude(Body body, Direction direction, double altitude) {
    ZoneId zone = configurationCache.getLocationContext().zoneId();

    Time start = toTime(ZonedDateTime.of(LocalDate.now(zone), LocalTime.MIDNIGHT, zone));

    Time result =
        Astronomy.searchAltitude(
            body,
            configurationCache.getLocationContext().observer(),
            direction,
            start,
            1,
            altitude);

    return Optional.ofNullable(result)
        .map(r -> toZoned(r, zone))
        .orElseThrow(() -> new IllegalStateException("No altitude event found for " + body));
  }

  private ZonedDateTime calculateRiseSet(Body body, Direction direction) {

    ZoneId zone = configurationCache.getLocationContext().zoneId();
    Time start = toTime(ZonedDateTime.of(LocalDate.now(zone), LocalTime.MIDNIGHT, zone));
    Time foundTime =
        Astronomy.searchRiseSet(
            body, configurationCache.getLocationContext().observer(), direction, start, 1);

    return Optional.ofNullable(foundTime)
        .map(r -> toZoned(r, zone))
        .orElseThrow(() -> new IllegalStateException("No altitude event found for " + body));
  }

  public Moon getMoon() {
    ZonedDateTime moonSet = calculateRiseSet(Body.Moon, Direction.Set);
    ZonedDateTime moonRise = calculateRiseSet(Body.Moon, Direction.Rise);

    return new Moon(moonRise, moonSet);
  }

  public Sun getSun() {
    ZonedDateTime sunSet = calculateRiseSet(Body.Sun, Direction.Set);
    ZonedDateTime sunRise = calculateRiseSet(Body.Sun, Direction.Rise);

    return new Sun(sunRise, sunSet);
  }
}
