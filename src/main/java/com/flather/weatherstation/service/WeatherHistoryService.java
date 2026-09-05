package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.domain.constant.DataProvider;
import com.flather.weatherstation.domain.constant.DayPeriod;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.DayPeriodMetrics;
import com.flather.weatherstation.dto.analytics.ChartPointDto;
import com.flather.weatherstation.dto.analytics.DailyHistoryDto;
import com.flather.weatherstation.dto.analytics.FullDaySummary;
import com.flather.weatherstation.dto.astronomy.DayPeriodInterval;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.dto.weather.HourlyWeatherRecordDto;
import com.flather.weatherstation.dto.weather.PeriodMetricDto;
import com.flather.weatherstation.mapper.WeatherHistoryMapper;
import com.flather.weatherstation.repository.DailyWeatherRecordRepository;
import com.flather.weatherstation.repository.HourlyWeatherRecordRepository;
import com.flather.weatherstation.util.MeteoMath;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WeatherHistoryService {

  private static final int RAW_RETENTION_DAYS = 29;
  private static final int MAX_RANGE_DAYS = 366;

  private final HourlyWeatherRecordRepository hourlyRepository;
  private final DailyWeatherRecordRepository dailyRepository;
  private final AnalyticsService analyticsService;
  private final ConfigurationCache configurationCache;
  private final AstronomySearch astronomySearch;
  private final SummaryCardService summaryCardService;
  private final WeatherHistoryMapper mapper;

  /**
   * One local calendar day of hourly chart points.
   *
   * <p>The date is resolved in the <em>station's</em> zone, not the caller's — a browser sitting in
   * another zone would otherwise ask for a window straddling two of the station's days, and the
   * chart would disagree with the per-period rows beside it, which are keyed on the station's date.
   *
   * <p>Which table answers depends on the day's age: inside the raw-retention window the points are
   * bucketed live from {@code weather_record}, beyond it they come pre-rolled from the hourly
   * table.
   *
   * <p>Each tier's query returns values already in the unit the metric is charted in, so the two
   * agree without this method knowing which metric it is serving. Surface wetness is the case that
   * matters: it is stored as a raw ADC count in both tables and converted to a percentage inside
   * each {@code findChartSurfaceWetness} query, so converting in only one of them would change the
   * axis halfway across the retention boundary.
   */
  public ChartDto getDayChart(LocalDate date, Metric metric) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();
    Instant from = date.atStartOfDay(zoneId).toInstant();
    Instant to = date.plusDays(1).atStartOfDay(zoneId).toInstant();
    Instant rawCutoff = Instant.now().minus(RAW_RETENTION_DAYS, ChronoUnit.DAYS);

    List<ChartPointDto> dtos =
        from.isBefore(rawCutoff)
            ? analyticsService.toChartPoints(findHourlyDataPoints(metric, from, to))
            : analyticsService.getMetricChart(from, to, metric, 60);

    return new ChartDto(metric.getName(), dtos, null, DataProvider.LOCAL_SENSOR);
  }

  public List<HourlyWeatherRecordDto> getHourlyHistory(Instant from, Instant to) {
    return mapper.toHourlyDtoList(hourlyRepository.findByHourBetweenOrderByHourAsc(from, to));
  }

  /**
   * The chart data and the stat cards for one range and metric, from a single pass over the rows.
   *
   * <p>One summary per date with its periods already assembled — returning the raw per-period rows
   * would leave callers to group by date themselves, and a caller that iterated them flat would
   * silently average FULL together with DAY and NIGHT.
   */
  public DailyHistoryDto getDailyHistory(LocalDate from, LocalDate to, Metric metric) {
    requireSaneRange(from, to);

    List<DayPeriodMetrics> rangeData = dailyRepository.findByDateBetweenOrderByDateAsc(from, to);

    Map<LocalDate, List<DayPeriodMetrics>> byDate = new LinkedHashMap<>();
    for (DayPeriodMetrics row : rangeData) {
      byDate.computeIfAbsent(row.getDate(), d -> new ArrayList<>()).add(row);
    }

    List<FullDaySummary> summaries = new ArrayList<>(byDate.size());
    byDate.forEach((date, rows) -> summaries.add(toSummary(date, rows, false)));

    return new DailyHistoryDto(summaries, summaryCardService.buildSummary(rangeData, metric));
  }

  /**
   * The modal never asks for more than 30 days, but the endpoint is public and the response now
   * carries three metric blocks per date. Bounded so a stray request cannot ask the database for a
   * decade in one go.
   */
  private static void requireSaneRange(LocalDate from, LocalDate to) {
    if (from.isAfter(to)) {
      throw new IllegalArgumentException("Range start " + from + " is after its end " + to);
    }
    long days = ChronoUnit.DAYS.between(from, to) + 1;
    if (days > MAX_RANGE_DAYS) {
      throw new IllegalArgumentException(
          "Range of " + days + " days exceeds the maximum of " + MAX_RANGE_DAYS);
    }
  }

  public List<LocalDate> getAvailableDates(LocalDate from, LocalDate to) {
    return dailyRepository.findDatesBetween(from, to);
  }

  public FullDaySummary getHistoryDailySummary(LocalDate date) {
    List<DayPeriodMetrics> rows = dailyRepository.findByDate(date);
    if (rows.isEmpty()) {
      throw new NoSuchElementException("No daily summary for date: " + date);
    }
    return toSummary(date, rows, true);
  }

  private FullDaySummary toSummary(
      LocalDate date, List<DayPeriodMetrics> rows, boolean includeIntervals) {
    Map<DayPeriod, PeriodMetricDto> byPeriod = new EnumMap<>(DayPeriod.class);
    for (DayPeriodMetrics row : rows) {
      // First row wins. The unique constraint is (device_id, date, period), so a second device
      // would otherwise collide here — this keeps that a stale reading rather than an exception.
      byPeriod.putIfAbsent(row.getPeriod(), mapper.toDto(row));
    }

    // Applied to the map's values, not inside the loop above: putIfAbsent means a period already
    // present is not re-mapped, and converting a DTO twice would square the transform.
    byPeriod.values().forEach(this::toWetnessPercentage);

    return new FullDaySummary(
        date,
        includeIntervals ? intervalFor(date, DayPeriod.NIGHT, byPeriod) : null,
        includeIntervals ? intervalFor(date, DayPeriod.DAY, byPeriod) : null,
        byPeriod.get(DayPeriod.FULL),
        byPeriod.get(DayPeriod.DAY),
        byPeriod.get(DayPeriod.NIGHT));
  }

  /**
   * Rewrites a period's surface wetness from the raw ADC count the rollup stores into the
   * percentage everything else shows — the charts convert in SQL, the live card through {@code
   * MeteoMath.rawToWetnessPct}, and these rows would otherwise be the one place a caller met ~3200
   * under a field the API describes as a percentage.
   *
   * <p><strong>Min and max are swapped, not converted in place.</strong> The transform is
   * decreasing — a higher ADC count is a drier surface — so the stored <em>minimum</em> count is
   * the wettest moment of the period and has to become the <em>maximum</em> percentage. Converting
   * each field where it stands would leave {@code surfaceWetnessMin} holding the larger number and
   * label the wettest moment "min".
   *
   * <p>Read before write for the same reason: both raw values are taken before either is assigned,
   * or the first assignment feeds the second.
   */
  private void toWetnessPercentage(PeriodMetricDto dto) {
    // A period with no mapped metrics is absent, not an error — FullDaySummary carries null for it
    // either way, so there is nothing here to rescale.
    if (dto == null) {
      return;
    }

    var validation = configurationCache.getValidationConfig();
    int dryBaseline = validation.surfaceWetnessDryBaseline();
    int wetBaseline = validation.surfaceWetnessWetBaseline();

    Double rawMin = dto.getSurfaceWetnessMin();
    Double rawMax = dto.getSurfaceWetnessMax();

    dto.setSurfaceWetnessMin(wetnessPercentage(rawMax, dryBaseline, wetBaseline));
    dto.setSurfaceWetnessMax(wetnessPercentage(rawMin, dryBaseline, wetBaseline));
    dto.setSurfaceWetnessAvg(
        wetnessPercentage(dto.getSurfaceWetnessAvg(), dryBaseline, wetBaseline));
  }

  /** Null stays null: a period with no wetness reading has no percentage either. */
  private static Double wetnessPercentage(Double raw, int dryBaseline, int wetBaseline) {
    return raw == null ? null : MeteoMath.rawToWetnessPct(raw, dryBaseline, wetBaseline);
  }

  /**
   * The window for a period, but only when that period actually has metrics behind it.
   *
   * <p>The two come from different places — the metrics from the database, the window recomputed
   * from astronomy — so they do not go missing together. Astronomy answers for any date, including
   * every date rolled up before the day/night split existed, which would otherwise put a confident
   * "20:02 → 06:14" above a row of dashes. An invalid window is dropped for the same reason: it
   * describes nothing the reader can use.
   */
  private DayPeriodInterval intervalFor(
      LocalDate date, DayPeriod period, Map<DayPeriod, PeriodMetricDto> byPeriod) {
    if (!byPeriod.containsKey(period)) {
      return null;
    }
    DayPeriodInterval interval = astronomySearch.getDayPeriodIntervalByDate(date, period);
    return interval != null && interval.isValid() ? interval : null;
  }

  private List<DataPoint> findHourlyDataPoints(Metric metric, Instant from, Instant to) {
    return switch (metric) {
      case TEMPERATURE -> hourlyRepository.findChartTemperature(from, to);
      case PRESSURE -> hourlyRepository.findChartPressure(from, to);
      case HUMIDITY -> hourlyRepository.findChartHumidity(from, to);
      case WIND -> hourlyRepository.findChartWindSpeed(from, to);
      case WIND_DIRECTION -> hourlyRepository.findChartWindDirection(from, to);
      case UV_INDEX -> hourlyRepository.findChartUvIndex(from, to);
      case SURFACE_WETNESS ->
          hourlyRepository.findChartSurfaceWetness(
              from,
              to,
              configurationCache.getValidationConfig().surfaceWetnessDryBaseline(),
              configurationCache.getValidationConfig().surfaceWetnessWetBaseline());
    };
  }
}
