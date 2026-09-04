package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.Metric;
import java.util.List;

/**
 * The stat cards shown above the history chart for one metric.
 *
 * <p>A list rather than fixed high/low/trend slots, because metrics genuinely differ in what they
 * can answer: UV tracks no daily minimum, so it has no "coldest day" equivalent to put in a low
 * slot, and a trend is meaningful for temperature but not for wind. Each metric contributes the
 * cards it has and the frontend renders however many arrive.
 *
 * @param metric the metric these cards describe, so the client can pick its unit and colour.
 * @param cards the cards, in display order. May be empty when a range holds no usable data.
 */
public record MetricSummary(Metric metric, List<SummaryCard> cards) {}
