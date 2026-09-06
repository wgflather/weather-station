package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.CardKind;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * One stat card above the history chart — "Warmest day 24.6°C, Aug 30", "Coldest night 8.2°C, Aug
 * 31", "Daylight trend +3°C, Aug 28 → Sep 3", "Driest stretch 29.8 %, 13:00 → 16:00".
 *
 * <p>Values and dates stay structured rather than pre-formatted. Units live in the frontend, in
 * {@code metric-units.js} — the single table the cards, the daily chart and the modal all read —
 * and dates rendered here would be fixed English while the chart tooltip beside them formats in the
 * viewer's own locale. The {@code label} is the exception: which question a card answers genuinely
 * differs per metric, and that decision belongs on this side.
 *
 * <p>Because the label travels with the value, a card's question can change server-side without the
 * frontend knowing — it renders whatever arrives. The value behind a label is not always the same
 * kind of number either: some metrics rank on a period average, others on a stored extreme, and a
 * diurnal card ranks hours of the day rather than days at all. See {@code SummaryCardService} for
 * which, and why.
 *
 * <p>A card carries <em>one</em> of three context shapes, and the other two stay null: a single
 * {@code date}, a {@code rangeStart}/{@code rangeEnd} pair of days, or a {@code windowStart}/{@code
 * windowEnd} pair of times.
 *
 * @param kind what the card measures; the frontend styles and formats on this.
 * @param label the card's heading, e.g. "Warmest day".
 * @param value the number itself, unformatted and in the metric's own unit.
 * @param date the day the value belongs to. Set for point-in-time kinds (the extremes), null for
 *     kinds that describe a span.
 * @param rangeStart first day of the span a spanning kind covers, null otherwise.
 * @param rangeEnd last day of that span, null otherwise.
 * @param windowStart first hour of the time-of-day window a diurnal card covers, null otherwise.
 *     This is <strong>wall-clock time at the station</strong>, not an instant — a viewer in another
 *     zone must still read the hour the station experienced, or the card would disagree with the
 *     chart beside it, which also resolves its days in the station's zone.
 * @param windowEnd the hour that window runs up to, exclusive, null otherwise. "13:00 → 16:00"
 *     covers the hours beginning 13, 14 and 15, matching the half-open convention the chart windows
 *     already use. It wraps past midnight, so it is not necessarily later than {@code windowStart}.
 */
public record SummaryCard(
    CardKind kind,
    String label,
    Double value,
    LocalDate date,
    LocalDate rangeStart,
    LocalDate rangeEnd,
    LocalTime windowStart,
    LocalTime windowEnd) {

  /** A card about one specific day — the extremes. */
  public static SummaryCard onDate(CardKind kind, String label, Double value, LocalDate date) {
    return new SummaryCard(kind, label, value, date, null, null, null, null);
  }

  /** A card about a span of days — the trend. */
  public static SummaryCard overRange(
      CardKind kind, String label, Double value, LocalDate from, LocalDate to) {
    return new SummaryCard(kind, label, value, null, from, to, null, null);
  }

  /** A card about a recurring time of day rather than a date — the diurnal extremes. */
  public static SummaryCard overWindow(
      CardKind kind, String label, Double value, LocalTime from, LocalTime to) {
    return new SummaryCard(kind, label, value, null, null, null, from, to);
  }
}
