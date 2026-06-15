package com.flather.weatherstation.dto.dashboard;

import com.flather.weatherstation.dto.analytics.ChartPointDto;
import java.time.Instant;
import java.util.List;

public record ChartDto(
    String metric, List<ChartPointDto> chartPoints, Instant nextBucketExpectedAt) {}
