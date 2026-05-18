package com.flather.weatherstation.dto.dashboard;

import com.flather.weatherstation.dto.analytics.HourlyChartAvgDto;

import java.util.List;

public record ChartDto(String metric, List<HourlyChartAvgDto> chartPoints) {
}
