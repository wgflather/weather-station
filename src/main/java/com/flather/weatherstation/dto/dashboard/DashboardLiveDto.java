package com.flather.weatherstation.dto.dashboard;

import com.flather.weatherstation.dto.astronomy.MoonSnapshot;
import com.flather.weatherstation.dto.astronomy.SunSnapshot;

/**
 * Response payload for {@code GET /api/weather/dashboard/live} — everything the client refreshes on
 * its polling tick (currently every 30 s).
 *
 * @param metrics weather metrics (temperature, pressure, humidity, surface wetness).
 * @param systemHealth ingestion freshness state (status, lag, today's record count, last
 *     measurement timestamp).
 * @param sunSnapshot continuously-changing solar state (current altitude).
 * @param moonSnapshot continuously-changing lunar state (altitude, distance, phase, constellation).
 * @param dailyKey the {@code "<LocalDate>@<ZoneId>"} key for the current observer day. The client
 *     compares this against the key stored alongside its cached daily payload — when they differ
 *     (midnight rollover or zone change) it re-fetches {@code /dashboard/daily}.
 */
public record DashboardLiveDto(
    MetricsDashboardDto metrics,
    SystemHealthDashboardDto systemHealth,
    SunSnapshot sunSnapshot,
    MoonSnapshot moonSnapshot,
    String dailyKey) {}
