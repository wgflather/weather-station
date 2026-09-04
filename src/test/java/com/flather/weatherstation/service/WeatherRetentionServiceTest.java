package com.flather.weatherstation.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.config.LocationContext;
import com.flather.weatherstation.domain.constant.DayPeriod;
import com.flather.weatherstation.domain.entity.DayPeriodMetrics;
import com.flather.weatherstation.dto.astronomy.DayPeriodInterval;
import com.flather.weatherstation.repository.DailyWeatherRecordRepository;
import com.flather.weatherstation.repository.WeatherRetentionRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * The rollup runs unattended inside a ten-minute window at 02:00, so a fault here surfaces as
 * missing rows rather than a stack trace anyone reads. The service takes no clock, so these tests
 * steer it by choosing a zone offset that puts "now" at the local time under test — see {@link
 * #zoneWhereLocalTimeIs}.
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class WeatherRetentionServiceTest {

  private static final int RAW_RETENTION_DAYS = 29;

  @Mock WeatherRetentionRepository retentionRepository;
  @Mock DailyWeatherRecordRepository dailyRecordRepository;
  @Mock ConfigurationCache configurationCache;
  @Mock AstronomySearch astronomySearch;
  @InjectMocks WeatherRetentionService service;

  /**
   * A zone offset in which the current instant reads as {@code target} local time. {@link
   * ZoneOffset} accepts any whole-second offset within ±18h, so an exact hit is always available
   * and the window checks can be exercised without waiting for 02:00.
   */
  private static ZoneOffset zoneWhereLocalTimeIs(LocalTime target) {
    int nowUtcSeconds = Instant.now().atOffset(ZoneOffset.UTC).toLocalTime().toSecondOfDay();
    int offset = Math.floorMod(target.toSecondOfDay() - nowUtcSeconds, 86_400);
    // Fold the upper half of the day into a negative offset to stay inside ZoneOffset's range.
    return ZoneOffset.ofTotalSeconds(offset > 18 * 3600 ? offset - 86_400 : offset);
  }

  private ZoneId useZone(LocalTime localNow) {
    ZoneOffset zone = zoneWhereLocalTimeIs(localNow);
    given(configurationCache.getLocationContext())
        .willReturn(new LocationContext(52.5, 13.4, 34.0, zone, null));
    return zone;
  }

  /** A sane, non-polar day: sunrise 06:00, sunset 20:00, night from the previous evening. */
  private void givenNormalSolarDay(ZoneId zone) {
    given(astronomySearch.getDayPeriodIntervalByDate(any(), eq(DayPeriod.DAY)))
        .willAnswer(
            call -> {
              LocalDate date = call.getArgument(0);
              return new DayPeriodInterval(
                  date.atTime(6, 0).atZone(zone), date.atTime(20, 0).atZone(zone));
            });
    given(astronomySearch.getDayPeriodIntervalByDate(any(), eq(DayPeriod.NIGHT)))
        .willAnswer(
            call -> {
              LocalDate date = call.getArgument(0);
              return new DayPeriodInterval(
                  date.minusDays(1).atTime(20, 0).atZone(zone), date.atTime(6, 0).atZone(zone));
            });
  }

  // ---- maintenance window ----

  @Test
  void rollUpAndCleanData_outsideMaintenanceWindow_doesNothing() {
    useZone(LocalTime.of(12, 0));

    service.rollUpAndCleanData();

    // Nothing at all — in particular no delete, which is the destructive half.
    verifyNoInteractions(retentionRepository);
    verifyNoInteractions(astronomySearch);
  }

  @Test
  void rollUpAndCleanData_insideWindow_rollsUpEveryRetainedDayThenDeletes() {
    ZoneId zone = useZone(LocalTime.of(2, 5));
    givenNormalSolarDay(zone);

    service.rollUpAndCleanData();

    verify(retentionRepository).rollupHourly(any(Instant.class), eq(0.5), eq(0.05));
    // One FULL row per complete day still covered by raw data, today excluded.
    verify(retentionRepository, times(RAW_RETENTION_DAYS))
        .rollupDailyPeriod(
            any(LocalDate.class), eq("FULL"), any(Instant.class), any(Instant.class));
    verify(retentionRepository).deleteRawOlderThan(any(Instant.class));
  }

  @Test
  void rollUpAndCleanData_deletesOnlyAfterTheRollupsHaveRead() {
    ZoneId zone = useZone(LocalTime.of(2, 5));
    givenNormalSolarDay(zone);

    service.rollUpAndCleanData();

    // The oldest day's night reaches back into the previous date's evening, so deleting
    // before the loop would truncate it. Order here is load-bearing, not incidental.
    var order = inOrder(retentionRepository);
    order.verify(retentionRepository).rollupHourly(any(), anyDouble(), anyDouble());
    order
        .verify(retentionRepository, times(RAW_RETENTION_DAYS))
        .rollupDailyPeriod(any(), eq("FULL"), any(), any());
    order.verify(retentionRepository).deleteRawOlderThan(any());
  }

  // ---- midnight summary ----

  @Test
  void midnightSummary_outsideItsWindow_doesNothing() {
    useZone(LocalTime.of(2, 5));

    service.generateYesterdaySummaryAtMidnight();

    verifyNoInteractions(retentionRepository);
  }

  @Test
  void midnightSummary_skipsWhenYesterdayAlreadyHasItsFullRow() {
    useZone(LocalTime.of(0, 10));
    given(dailyRecordRepository.findByDateAndPeriod(any(), eq(DayPeriod.FULL)))
        .willReturn(Optional.of(new DayPeriodMetrics()));

    service.generateYesterdaySummaryAtMidnight();

    verifyNoInteractions(retentionRepository);
  }

  @Test
  void midnightSummary_writesAllThreePeriodsWithTheirOwnWindows() {
    ZoneId zone = useZone(LocalTime.of(0, 10));
    givenNormalSolarDay(zone);
    given(dailyRecordRepository.findByDateAndPeriod(any(), eq(DayPeriod.FULL)))
        .willReturn(Optional.empty());

    service.generateYesterdaySummaryAtMidnight();

    LocalDate yesterday = LocalDate.now(zone).minusDays(1);
    ArgumentCaptor<String> periods = ArgumentCaptor.forClass(String.class);
    ArgumentCaptor<Instant> from = ArgumentCaptor.forClass(Instant.class);
    ArgumentCaptor<Instant> to = ArgumentCaptor.forClass(Instant.class);

    verify(retentionRepository, times(3))
        .rollupDailyPeriod(eq(yesterday), periods.capture(), from.capture(), to.capture());

    assertThat(periods.getAllValues()).containsExactly("FULL", "NIGHT", "DAY");

    // FULL is the plain local day.
    assertThat(from.getAllValues().get(0)).isEqualTo(yesterday.atStartOfDay(zone).toInstant());
    assertThat(to.getAllValues().get(0))
        .isEqualTo(yesterday.plusDays(1).atStartOfDay(zone).toInstant());

    // NIGHT starts the previous evening and ends at this date's sunrise — the whole point of
    // the definition, and the thing a midnight split would get wrong.
    assertThat(from.getAllValues().get(1))
        .isEqualTo(yesterday.minusDays(1).atTime(20, 0).atZone(zone).toInstant());
    assertThat(to.getAllValues().get(1)).isEqualTo(yesterday.atTime(6, 0).atZone(zone).toInstant());

    // DAY is sunrise to sunset on the date itself, and picks up where NIGHT ends.
    assertThat(from.getAllValues().get(2)).isEqualTo(to.getAllValues().get(1));
    assertThat(to.getAllValues().get(2))
        .isEqualTo(yesterday.atTime(20, 0).atZone(zone).toInstant());
  }

  // ---- polar and degenerate days ----

  @Test
  void polarDay_withNoSunriseOrSunset_writesFullOnly() {
    ZoneId zone = useZone(LocalTime.of(0, 10));
    given(dailyRecordRepository.findByDateAndPeriod(any(), eq(DayPeriod.FULL)))
        .willReturn(Optional.empty());
    // Both ends absent: the sun never crosses the horizon.
    given(astronomySearch.getDayPeriodIntervalByDate(any(), any()))
        .willReturn(new DayPeriodInterval(null, null));

    service.generateYesterdaySummaryAtMidnight();

    verify(retentionRepository).rollupDailyPeriod(any(), eq("FULL"), any(), any());
    verify(retentionRepository, never()).rollupDailyPeriod(any(), eq("DAY"), any(), any());
    verify(retentionRepository, never()).rollupDailyPeriod(any(), eq("NIGHT"), any(), any());
  }

  @Test
  void nightSpanningMoreThanADay_writesFullOnly() {
    ZoneId zone = useZone(LocalTime.of(0, 10));
    LocalDate yesterday = LocalDate.now(zone).minusDays(1);
    given(dailyRecordRepository.findByDateAndPeriod(any(), eq(DayPeriod.FULL)))
        .willReturn(Optional.empty());

    given(astronomySearch.getDayPeriodIntervalByDate(any(), eq(DayPeriod.DAY)))
        .willAnswer(
            call -> {
              LocalDate date = call.getArgument(0);
              return new DayPeriodInterval(
                  date.atTime(6, 0).atZone(zone), date.atTime(20, 0).atZone(zone));
            });
    // Near the polar circle a sunset can resolve just after midnight, pairing with the next
    // sunrise into a 30-hour "night". It is ordered correctly, so only the length bound
    // catches it — and it must not reach the aggregate.
    given(astronomySearch.getDayPeriodIntervalByDate(any(), eq(DayPeriod.NIGHT)))
        .willReturn(
            new DayPeriodInterval(
                yesterday.minusDays(1).atTime(0, 15).atZone(zone),
                yesterday.atTime(6, 0).atZone(zone)));

    service.generateYesterdaySummaryAtMidnight();

    verify(retentionRepository).rollupDailyPeriod(any(), eq("FULL"), any(), any());
    verify(retentionRepository, never()).rollupDailyPeriod(any(), eq("NIGHT"), any(), any());
    // Day and night are written together or not at all, so a bad night suppresses both.
    verify(retentionRepository, never()).rollupDailyPeriod(any(), eq("DAY"), any(), any());
  }

  @Test
  void invalidDayWindow_alsoFallsBackToFullOnly() {
    ZoneId zone = useZone(LocalTime.of(0, 10));
    LocalDate yesterday = LocalDate.now(zone).minusDays(1);
    given(dailyRecordRepository.findByDateAndPeriod(any(), eq(DayPeriod.FULL)))
        .willReturn(Optional.empty());

    given(astronomySearch.getDayPeriodIntervalByDate(any(), eq(DayPeriod.NIGHT)))
        .willReturn(
            new DayPeriodInterval(
                yesterday.minusDays(1).atTime(20, 0).atZone(zone),
                yesterday.atTime(6, 0).atZone(zone)));
    // Sunset before sunrise — degenerate, and it must not become a backwards range.
    ZonedDateTime rise = yesterday.atTime(20, 0).atZone(zone);
    ZonedDateTime set = yesterday.atTime(6, 0).atZone(zone);
    given(astronomySearch.getDayPeriodIntervalByDate(any(), eq(DayPeriod.DAY)))
        .willReturn(new DayPeriodInterval(rise, set));

    service.generateYesterdaySummaryAtMidnight();

    verify(retentionRepository).rollupDailyPeriod(any(), eq("FULL"), any(), any());
    verify(retentionRepository, never()).rollupDailyPeriod(any(), eq("DAY"), any(), any());
  }
}
