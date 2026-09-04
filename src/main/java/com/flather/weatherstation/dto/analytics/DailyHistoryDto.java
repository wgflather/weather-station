package com.flather.weatherstation.dto.analytics;

import java.util.List;

/**
 * Everything the history modal's multi-day view needs for one range and metric.
 *
 * <p>Bundled rather than served as separate chart and card calls because the view already refetches
 * the range whenever the metric changes — the cards are metric-specific, but so is everything else
 * on screen, so splitting them only bought a second round trip per tab click.
 *
 * @param days one entry per date that has data, in ascending date order, periods already grouped.
 * @param summary the stat cards for this metric. Empty when the metric has no cards defined rather
 *     than absent, so a chart still renders for a metric whose cards are not built yet.
 */
public record DailyHistoryDto(List<FullDaySummary> days, MetricSummary summary) {}
