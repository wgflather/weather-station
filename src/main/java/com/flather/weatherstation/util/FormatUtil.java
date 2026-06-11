package com.flather.weatherstation.util;

import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

public class FormatUtil {

    private static final DateTimeFormatter TIME_FORMAT =
            DateTimeFormatter.ofPattern("HH:mm");

    public static String formatTime(
            ZonedDateTime time
    ) {

        if (time == null) {
            return "--:--";
        }

        return time.format(TIME_FORMAT);
    }

    public static String azimuthToDirection(
            double azimuth
    ) {

        String[] dirs = {
                "N","NE","E","SE",
                "S","SW","W","NW"
        };

        return dirs[
                (int)Math.round(azimuth / 45.0) % 8
                ];
    }


}