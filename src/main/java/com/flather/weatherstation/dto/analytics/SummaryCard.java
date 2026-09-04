package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.CardKind;
import java.time.LocalDate;

/**
 * One stat card above the history chart — "Warmest day 31°C, Aug 30", "Daylight trend +3°C, Aug 28
 * → Sep 3".
 *
 * <p>Values and dates stay structured rather than pre-formatted. Units already live in the frontend
 * ({@code UNITS} in history-modal.js, {@code DAILY_CFG} in daily-chart.js), and dates rendered here
 * would be fixed English while the chart tooltip beside them formats in the viewer's own locale.
 * The {@code label} is the exception: which question a card answers genuinely differs per metric,
 * and that decision belongs on this side.
 *
 * @param kind what the card measures; the frontend styles and formats on this.
 * @param label the card's heading, e.g. "Warmest day".
 * @param value the number itself, unformatted and in the metric's own unit.
 * @param date the day the value belongs to. Set for point-in-time kinds (the extremes), null for
 *     kinds that describe a span.
 * @param rangeStart first day of the span a spanning kind covers, null otherwise.
 * @param rangeEnd last day of that span, null otherwise.
 */
public record SummaryCard(
    CardKind kind,
    String label,
    Double value,
    LocalDate date,
    LocalDate rangeStart,
    LocalDate rangeEnd) {

  /** A card about one specific day — the extremes. */
  public static SummaryCard onDate(CardKind kind, String label, Double value, LocalDate date) {
    return new SummaryCard(kind, label, value, date, null, null);
  }

  /** A card about a span of days — the trend. */
  public static SummaryCard overRange(
      CardKind kind, String label, Double value, LocalDate from, LocalDate to) {
    return new SummaryCard(kind, label, value, null, from, to);
  }
}
