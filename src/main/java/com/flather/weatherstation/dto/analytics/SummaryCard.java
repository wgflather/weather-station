package com.flather.weatherstation.dto.analytics;

import com.flather.weatherstation.domain.constant.CardKind;
import java.time.LocalDate;
import java.time.LocalTime;

/**
 * One stat card above the history chart — "Warmest daylight avg 24.6°C, Aug 30", "Coldest night avg
 * 8.2°C, Aug 31", "Daylight trend +3°C, Aug 28 → Sep 3", "Driest stretch 29.8 %, 13:00 → 16:00".
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
 * <p><strong>Context shapes.</strong> A card names when its value happened in one of four ways, and
 * whichever fields the shape does not use stay null:
 *
 * <ul>
 *   <li>a single {@code date} — the day extremes;
 *   <li>a {@code rangeStart}/{@code rangeEnd} pair of days — the trend;
 *   <li>a {@code windowStart}/{@code windowEnd} pair of times — the diurnal extremes, which name a
 *       recurring stretch of the day and no date at all;
 *   <li>a {@code date} <em>and</em> a bare {@code windowStart} — one reading at one hour, where the
 *       hour is half the point ("closest to dew point, Sep 5, 20:00"). {@code windowStart} carries
 *       the hour here rather than a window opening, which is why the frontend picks its caption
 *       from which fields arrived rather than from {@code kind}.
 * </ul>
 *
 * @param kind what the card measures; the frontend styles and formats on this.
 * @param label the card's heading, e.g. "Warmest daylight avg". It names the statistic as well as
 *     the question, because the cards do not all report one: some are period averages and some are
 *     single stored extremes.
 * @param value the number itself, unformatted.
 * @param unitMetric the metric whose unit {@code value} is in, as its request key ({@code
 *     "temperature"}), or null when it is the card's own metric — which is the normal case. Set
 *     only where a card carries a quantity its tab is not measured in: the dew point card sits on
 *     the humidity tab but reports a temperature spread in °C, and would otherwise render as a
 *     percentage. A key rather than a unit string, so the unit table stays the frontend's alone.
 * @param date the day the value belongs to. Set for point-in-time kinds (the extremes), null for
 *     kinds that describe a span.
 * @param rangeStart first day of the span a spanning kind covers, null otherwise.
 * @param rangeEnd last day of that span, null otherwise.
 * @param windowStart first hour of the time-of-day window a diurnal card covers — or, alongside a
 *     {@code date}, the single hour a reading landed on. Null otherwise. This is <strong>wall-clock
 *     time at the station</strong>, not an instant — a viewer in another zone must still read the
 *     hour the station experienced, or the card would disagree with the chart beside it, which also
 *     resolves its days in the station's zone.
 * @param windowEnd the hour that window runs up to, exclusive, null otherwise. "13:00 → 16:00"
 *     covers the hours beginning 13, 14 and 15, matching the half-open convention the chart windows
 *     already use. It wraps past midnight, so it is not necessarily later than {@code windowStart}.
 */
public record SummaryCard(
    CardKind kind,
    String label,
    Double value,
    String unitMetric,
    LocalDate date,
    LocalDate rangeStart,
    LocalDate rangeEnd,
    LocalTime windowStart,
    LocalTime windowEnd) {

  /** A card about one specific day — the extremes. */
  public static SummaryCard onDate(CardKind kind, String label, Double value, LocalDate date) {
    return new SummaryCard(kind, label, value, null, date, null, null, null, null);
  }

  /**
   * A card about one reading at one hour, in {@code unitMetric}'s unit — pass null for that to read
   * in the card's own metric.
   */
  public static SummaryCard onDateAndHour(
      CardKind kind,
      String label,
      Double value,
      String unitMetric,
      LocalDate date,
      LocalTime hour) {
    return new SummaryCard(kind, label, value, unitMetric, date, null, null, hour, null);
  }

  /** A card about a span of days — the trend. */
  public static SummaryCard overRange(
      CardKind kind, String label, Double value, LocalDate from, LocalDate to) {
    return new SummaryCard(kind, label, value, null, null, from, to, null, null);
  }

  /** A card about a recurring time of day rather than a date — the diurnal extremes. */
  public static SummaryCard overWindow(
      CardKind kind, String label, Double value, LocalTime from, LocalTime to) {
    return new SummaryCard(kind, label, value, null, null, null, null, from, to);
  }
}
