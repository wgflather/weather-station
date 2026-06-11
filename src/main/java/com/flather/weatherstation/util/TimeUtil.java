package com.flather.weatherstation.util;

import io.github.cosinekitty.astronomy.Time;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;

public class TimeUtil {

    public static final ZoneId ZONE =
            ZoneId.systemDefault();

    public static Time toTime(
            ZonedDateTime time
    ) {

        return Time.fromMillisecondsSince1970(
                time.toInstant().toEpochMilli()
        );
    }

    public static ZonedDateTime toZoned(
            Time time,
            ZoneId zoneId
    ) {

        return Instant.ofEpochMilli(
                time.toMillisecondsSince1970()
        ).atZone(ZONE);
    }

    /**
     * Converts a duration in seconds into a formatted "hh:mm" string.
     * * @param totalSeconds The total duration in seconds (e.g., 51720 seconds)
     * @return A formatted string (e.g., "14:22")
     */
    public static String formatDurationHM(long totalSeconds) {
        // Enforce absolute value to gracefully handle any negative time anomalies
        long seconds = Math.abs(totalSeconds);

        long hours = seconds / 3600;
        long minutes = (seconds % 3600) / 60;

        return String.format("%02d hours %02d minutes", hours, minutes);
    }
}