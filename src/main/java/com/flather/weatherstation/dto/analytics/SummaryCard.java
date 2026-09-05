package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.CardKind;
import java.time.LocalDate;

/**
 * One stat card above the history chart — "Warmest day 24.6°C, Aug 30", "Coldest night 8.2°C, Aug
 * 31", "Daylight trend +3°C, Aug 28 → Sep 3".
 *
 * <p>Values and dates stay structured rather than pre-formatted. Units live in the frontend, in
 * {@code metric-units.js} — the single table the cards, the daily chart and the modal all read —
 * and dates rendered here would be fixed English while the chart tooltip beside them formats in the
 * viewer's own locale. The {@code label} is the exception: which question a card answers genuinely
 * differs per metric, and that decision belongs on this side.
 *
 * <p>Because the label travels with the value, a card's question can change server-side without the
 * frontend knowing — it renders whatever arrives. The value behind a label is not always the same
 * kind of number either: some metrics rank on a period average, others on a stored extreme. See
 * {@code SummaryCardService} for which, and why.
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
