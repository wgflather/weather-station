package com.flather.weatherstation.dto.dashboard;

import com.flather.weatherstation.dto.astronomy.MoonDailyEvents;
import com.flather.weatherstation.dto.astronomy.MoonSnapshot;
import com.flather.weatherstation.dto.astronomy.SunDailyEvents;
import com.flather.weatherstation.dto.astronomy.SunSnapshot;

/**
 * Combined solar and lunar state served to the dashboard, separated by update cadence so the client
 * can refresh the live snapshot fields frequently while leaving the daily events alone.
 *
 * @param sunSnapshot continuously-changing solar state (current altitude).
 * @param sunDailyEvents fixed-for-the-day solar events (rise, set, twilights, day/night length).
 * @param moonSnapshot continuously-changing lunar state (altitude, distance, phase, constellation).
 * @param moonDailyEvents fixed-for-the-day lunar events (rise, set, peak transit).
 */
public record AstronomySnapshot(
    SunSnapshot sunSnapshot,
    SunDailyEvents sunDailyEvents,
    MoonSnapshot moonSnapshot,
    MoonDailyEvents moonDailyEvents) {}
