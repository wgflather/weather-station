package com.flather.weatherstation.service;



import com.flather.weatherstation.config.LocationProperties;
import com.flather.weatherstation.dto.astronomy.Moon;
import com.flather.weatherstation.dto.astronomy.Sun;
import io.github.cosinekitty.astronomy.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Optional;


import static com.flather.weatherstation.util.TimeUtil.toTime;
import static com.flather.weatherstation.util.TimeUtil.toZoned;

@Service
@RequiredArgsConstructor
public class AstronomySearch {
    private final LocationProperties locationContext;

    private ZonedDateTime findWhenAtAltitude(
            Body body,
            Direction direction,
            double altitude
    ) {
        ZoneId zone = locationContext.getZoneId();

        Time start = toTime(
                ZonedDateTime.of(
                        LocalDate.now(zone),
                        LocalTime.MIDNIGHT,
                        zone
                )
        );

        Time result = Astronomy.searchAltitude(
                body,
                locationContext.getObserver(),
                direction,
                start,
                1,
                altitude
        );

        return Optional.ofNullable(result)
                .map(r -> toZoned(r, zone))
                .orElseThrow(() ->
                        new IllegalStateException(
                                "No altitude event found for " + body));
    }

    private ZonedDateTime calculateRiseSet(Body body, Direction direction){

        ZoneId zone = locationContext.getZoneId();
        Time start = toTime(
                ZonedDateTime.of(
                        LocalDate.now(zone),
                        LocalTime.MIDNIGHT,
                        zone
                )
        );
        Time foundTime = Astronomy.searchRiseSet(body, locationContext.getObserver(), direction, start, 1);

        return Optional.ofNullable(foundTime)
                .map(r -> toZoned(r, zone))
                .orElseThrow(() ->
                        new IllegalStateException(
                                "No altitude event found for " + body));

    }

    public Moon getMoon(){
        ZonedDateTime moonSet = calculateRiseSet(Body.Moon, Direction.Set);
        ZonedDateTime moonRise = calculateRiseSet(Body.Moon, Direction.Rise);

        return new Moon(moonRise, moonSet);
    }

    public Sun getSun(){
        ZonedDateTime sunSet = calculateRiseSet(Body.Sun, Direction.Set);
        ZonedDateTime sunRise = calculateRiseSet(Body.Sun, Direction.Rise);

        return new Sun(sunRise, sunSet);
    }
}