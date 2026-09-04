package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.dto.astronomy.DayPeriodInterval;
import com.flather.weatherstation.dto.weather.PeriodMetricDto;
import java.time.LocalDate;

/**
 * One calendar day's rollup, with its periods assembled into a single object so callers never have
 * to join three rows by period themselves.
 *
 * <p>The three periods do not partition the date. Daylight and All day both sit inside it, but a
 * night runs from the <em>previous</em> day's sunset to this day's sunrise — so this date's evening
 * counts towards All day here and towards Night on the following date. That is deliberate: a night
 * split at midnight welds an evening to the pre-dawn hours of a different night, which puts the
 * coldest and warmest parts of two separate nights in one row.
 *
 * @param date the local calendar date these metrics cover.
 * @param nightPeriod the window the night metrics were measured over, previous sunset to this
 *     sunrise. Recomputed on read rather than stored, and null whenever {@code night} is null or
 *     the window does not describe a real period.
 * @param dayPeriod the window the daylight metrics were measured over, this date's sunrise to its
 *     sunset. Null under the same conditions as {@code nightPeriod}, relative to {@code day}.
 * @param fullDay metrics over the whole local day, midnight to midnight.
 * @param day metrics between sunrise and sunset. Null for any date rolled up before the day/night
 *     split existed, and for polar dates where the sun does not cross the horizon.
 * @param night metrics over the night that ended on this date's morning. Null under the same
 *     conditions as {@code day}.
 */
public record FullDaySummary(
    LocalDate date,
    DayPeriodInterval nightPeriod,
    DayPeriodInterval dayPeriod,
    PeriodMetricDto fullDay,
    PeriodMetricDto day,
    PeriodMetricDto night) {}
