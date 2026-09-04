package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.cache.SensorStateCache;
import com.flather.weatherstation.domain.constant.*;
import com.flather.weatherstation.domain.constant.BeaufortScale;
import com.flather.weatherstation.domain.constant.UvLevel;
import com.flather.weatherstation.domain.constant.WindDirectionLabel;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.dto.analytics.*;
import com.flather.weatherstation.dto.analytics.MetricDataDetails;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.mapper.MetricDataDetailsMapper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import com.flather.weatherstation.util.DateRangeHelper;
import com.flather.weatherstation.util.MeteoMath;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.function.Function;
import org.apache.commons.math3.util.Precision;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class AnalyticsService {
  private final WeatherReportRepository repository;
  private final SensorStateCache sensorStateCache;
  private final MetricDataDetailsMapper metricDataDetailsMapper;
  private final ConfigurationCache configurationCache;

  public AnalyticsService(
      WeatherReportRepository repository,
      ConfigurationCache configurationCache,
      SensorStateCache sensorStateCache,
      MetricDataDetailsMapper metricDataDetailsMapper) {
    this.repository = repository;
    this.sensorStateCache = sensorStateCache;
    this.metricDataDetailsMapper = metricDataDetailsMapper;
    this.configurationCache = configurationCache;
  }

  private DateRangeHelper.DateRange today() {
    return DateRangeHelper.getDateRange(configurationCache.getLocationContext().zoneId());
  }

  public long findTodayRecordsCount() {
    var range = today();
    return repository.countRecordsBetween(range.startTime(), range.endTime());
  }

  private static final int QUALITY_BUCKET_MINUTES = 30;
  private static final Duration QUALITY_WINDOW = Duration.ofHours(24);

  /**
   * Shortest silence worth calling an outage, whatever the station's cadence. Below this it is
   * indistinguishable from a couple of dropped MQTT messages.
   */
  private static final int MIN_GAP_MINUTES = 15;

  /** A gap must span at least this many missed readings before it counts. */
  private static final int MIN_MISSED_READINGS = 3;

  /**
   * Data-quality counts for the last 24 h, in {@value #QUALITY_BUCKET_MINUTES}-minute buckets.
   *
   * <p>The window is anchored so the <em>final</em> bucket contains "now" rather than ending at the
   * last completed bucket — otherwise the strip would stop up to 30 minutes in the past and could
   * not show a sensor that has just dropped out. That makes the final bucket partial by
   * construction: it is only {@code (now - bucketStart)} old, so callers must prorate its expected
   * reading count before judging it degraded.
   */
  public QualityStrip findLast24HoursQualityStrip() {
    long bucketSec = Duration.ofMinutes(QUALITY_BUCKET_MINUTES).toSeconds();
    Instant now = Instant.now();
    long slotSec = Math.floorDiv(now.getEpochSecond(), bucketSec) * bucketSec;

    Instant to = Instant.ofEpochSecond(slotSec + bucketSec);
    Instant from = to.minus(QUALITY_WINDOW);

    List<QualityBucket> bucketList =
        repository.findQualityBuckets(from, to, QUALITY_BUCKET_MINUTES + " minutes");

    // The gap search is bounded by now rather than to: to is the end of the still-running final
    // bucket and lies in the future, which would show up as a trailing gap on every station.
    List<DataGap> gaps = repository.findGaps(from, now, minGapMinutes(bucketList));

    return new QualityStrip(
        from, to, QUALITY_BUCKET_MINUTES, bucketList, getMetricSummaries(bucketList), gaps);
  }

  /**
   * How long a silence has to run before it is an outage rather than a hiccup.
   *
   * <p>Every consecutive pair of readings is technically a gap, so this floor is what stops a
   * healthy station returning one entry per reading. It scales with the station's own cadence —
   * inferred from the buckets already fetched, since the reporting interval isn't configured
   * anywhere — so a 30-minute station doesn't have every normal interval flagged, while the
   * absolute floor keeps a 1-minute station from reporting three missed messages as an outage.
   */
  private int minGapMinutes(List<QualityBucket> bucketList) {
    int median = medianBucketTotal(bucketList);
    if (median <= 0) return MIN_GAP_MINUTES;

    double cadenceMinutes = (double) QUALITY_BUCKET_MINUTES / median;
    return (int) Math.max(MIN_GAP_MINUTES, Math.round(cadenceMinutes * MIN_MISSED_READINGS));
  }

  /**
   * The station's usual readings per bucket. Median rather than mean or max so that outage buckets
   * (zero) and bursts can't drag it around.
   */
  private int medianBucketTotal(List<QualityBucket> bucketList) {
    int[] totals =
        bucketList.stream()
            .mapToInt(QualityBucket::totalCount)
            .filter(t -> t > 0)
            .sorted()
            .toArray();
    return totals.length == 0 ? 0 : totals[totals.length / 2];
  }

  private MetricQualitySummary summarize(List<QualityBucket> bucketList, Metric metric) {
    int okCount = 0;
    int spikeCount = 0;
    int anomalyCount = 0;
    int missingCount = 0;
    int notConfiguredCount = 0;

    for (QualityBucket bucket : bucketList) {
      MetricQualityCounts counts = bucket.qualityFor(metric);

      okCount += counts.okCount();
      spikeCount += counts.spikeCount();
      anomalyCount += counts.anomalyCount();
      missingCount += counts.missingCount();
      notConfiguredCount += counts.notConfiguredCount();
    }

    return new MetricQualitySummary(
        metric.getRequestKey(),
        okCount,
        spikeCount,
        anomalyCount,
        missingCount,
        notConfiguredCount);
  }

  public List<MetricQualitySummary> getMetricSummaries(List<QualityBucket> bucketList) {
    ArrayList<MetricQualitySummary> summaries = new ArrayList<>();
    for (Metric metric : Metric.values()) {
      if (configurationCache.getDataProviderConfiguration().getProviderByMetric(metric)
          != DataProvider.EXTERNAL_API) summaries.add(summarize(bucketList, metric));
    }

    return summaries;
  }

  public Optional<ZonedDateTime> findLastRecordTime() {

    WeatherRecord last = sensorStateCache.getLastSavedMeasurement();

    if (last == null) {
      return Optional.empty();
    }
    return Optional.of(
        last.getMeasuredAt().atZone(configurationCache.getLocationContext().zoneId()));
  }

  public long getLagMinutes(ZonedDateTime lastRecord) {
    return Duration.between(
            lastRecord, Instant.now().atZone(configurationCache.getLocationContext().zoneId()))
        .toMinutes();
  }

  private Double averageOfFiveLastReadings(
      Function<WeatherRecord, Double> valueExtractor,
      Function<WeatherRecord, DataQuality> qualityExtractor) {

    OptionalDouble avg =
        sensorStateCache.getMetricsWindow().reversed().stream()
            .filter(r -> qualityExtractor.apply(r) == DataQuality.OK)
            .map(valueExtractor)
            .filter(Objects::nonNull)
            .limit(5)
            .mapToDouble(Double::doubleValue)
            .average();

    return avg.isPresent() ? Precision.round(avg.getAsDouble(), 1) : null;
  }

  private List<DataPoint> extractDataPoints(Function<WeatherRecord, Double> valueExtractor) {

    return sensorStateCache.getMetricsWindow().stream()
        .map(record -> new DataPoint(record.getMeasuredAt(), valueExtractor.apply(record)))
        .toList();
  }

  public TemperatureDto getTemperature() {
    return new TemperatureDto(
        averageOfFiveLastReadings(
            WeatherRecord::getTemperature, WeatherRecord::getTemperatureDataQuality),
        getTempTrend(),
        sensorStateCache.getTodayMinTemp(),
        sensorStateCache.getTodayMaxTemp(),
        metricDataDetailsMapper.from(
            sensorStateCache.getLastSavedMeasurement(), Metric.TEMPERATURE));
  }

  public PressureDto getPressure() {
    TrendResult trendResult = getPressureTrend();
    return new PressureDto(
        averageOfFiveLastReadings(
            WeatherRecord::getPressure, WeatherRecord::getPressureDataQuality),
        trendResult,
        metricDataDetailsMapper.from(sensorStateCache.getLastSavedMeasurement(), Metric.PRESSURE),
        PressureTrend.classify(trendResult));
  }

  public WindDto getWind() {
    OptionalDouble gust =
        sensorStateCache.getMetricsWindow().stream()
            .filter(r -> r.getWindDataQuality() == DataQuality.OK && r.getWind() != null)
            .mapToDouble(WeatherRecord::getWind)
            .max();

    WeatherRecord last = sensorStateCache.getLastSavedMeasurement();
    Double direction = last != null ? last.getWindDirection() : null;
    WindDirectionLabel dirLabel =
        direction != null ? WindDirectionLabel.fromDegrees(direction) : null;
    Double speed =
        averageOfFiveLastReadings(WeatherRecord::getWind, WeatherRecord::getWindDataQuality);

    return new WindDto(
        speed,
        gust.isPresent() ? Precision.round(gust.getAsDouble(), 1) : null,
        direction,
        dirLabel,
        BeaufortScale.fromMs(speed),
        metricDataDetailsMapper.from(last, Metric.WIND));
  }

  public UvIndexDto getUvIndex() {
    Double value =
        averageOfFiveLastReadings(WeatherRecord::getUvIndex, WeatherRecord::getUvIndexDataQuality);
    return new UvIndexDto(
        value,
        UvLevel.fromIndex(value),
        metricDataDetailsMapper.from(sensorStateCache.getLastSavedMeasurement(), Metric.UV_INDEX));
  }

  public HumidityDto getHumidity() {
    Double temperature =
        averageOfFiveLastReadings(
            WeatherRecord::getTemperature, WeatherRecord::getTemperatureDataQuality);
    Double humidity =
        averageOfFiveLastReadings(
            WeatherRecord::getHumidity, WeatherRecord::getHumidityDataQuality);

    Double dewPoint = null;
    DewPointRisk dewPointRisk = DewPointRisk.POSSIBLE;

    if (temperature != null && humidity != null) {
      dewPoint = MeteoMath.calculateDewPoint(temperature, humidity);
      dewPointRisk = DewPointRisk.classify(temperature - dewPoint);
    }

    return new HumidityDto(
        humidity,
        metricDataDetailsMapper.from(sensorStateCache.getLastSavedMeasurement(), Metric.HUMIDITY),
        dewPoint,
        dewPointRisk);
  }

  public SurfaceWetnessDto getSurfaceWetness() {
    List<WeatherRecord> window = sensorStateCache.getMetricsWindow();
    if (window.isEmpty()) {
      return new SurfaceWetnessDto(null, null, SurfaceWetnessStatus.DRY);
    }

    Double raw = window.getLast().getSurfaceWetness();
    MetricDataDetails dataDetails =
        metricDataDetailsMapper.from(
            sensorStateCache.getLastSavedMeasurement(), Metric.SURFACE_WETNESS);

    if (raw == null) {
      return new SurfaceWetnessDto(null, dataDetails, SurfaceWetnessStatus.DRY);
    }

    double pctWetness =
        MeteoMath.rawToWetnessPct(
            raw,
            configurationCache.getValidationConfig().surfaceWetnessDryBaseline(),
            configurationCache.getValidationConfig().surfaceWetnessWetBaseline());

    return new SurfaceWetnessDto(
        pctWetness, dataDetails, SurfaceWetnessStatus.classify(pctWetness));
  }

  public List<ChartPointDto> getMetricChart(
      Instant from, Instant to, Metric metric, int resolution) {
    String bucketInterval = resolution + "minutes";
    switch (metric) {
      case TEMPERATURE -> {
        return dataPointToDto(repository.findChartTemperature(from, to, bucketInterval));
      }
      case PRESSURE -> {
        return dataPointToDto(repository.findChartPressure(from, to, bucketInterval));
      }
      case HUMIDITY -> {
        return dataPointToDto(repository.findChartHumidity(from, to, bucketInterval));
      }
      case WIND -> {
        return dataPointToDto(repository.findChartWind(from, to, bucketInterval));
      }
      case UV_INDEX -> {
        return dataPointToDto(repository.findChartUvIndex(from, to, bucketInterval));
      }
      default -> throw new IllegalArgumentException("Unknown Metric");
    }
  }

  private List<ChartPointDto> dataPointToDto(List<DataPoint> dataPoints) {
    return dataPoints.stream()
        .map(
            projection ->
                new ChartPointDto(
                    projection.hour().atZone(configurationCache.getLocationContext().zoneId()),
                    projection.value()))
        .toList();
  }

  public ChartDto returnChart(Metric metric, String since, int resolution) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();
    Instant sinceInstant =
        (since == null)
            ? LocalDate.now(zoneId).atStartOfDay(zoneId).toInstant()
            : OffsetDateTime.parse(since).toInstant();

    List<ChartPointDto> dtos = getMetricChart(sinceInstant, Instant.now(), metric, resolution);

    Instant nextBucketExpectedAt = null;

    if (!dtos.isEmpty()) {
      nextBucketExpectedAt = getNextExpectedBucketEpochMillis(dtos.getLast().hour(), resolution);
    }

    return new ChartDto(metric.getName(), dtos, nextBucketExpectedAt, DataProvider.LOCAL_SENSOR);
  }

  private Instant getNextExpectedBucketEpochMillis(ZonedDateTime zonedDateTime, int resolution) {
    return zonedDateTime.toInstant().plusSeconds(Duration.ofMinutes(resolution).toSeconds());
  }

  public TrendResult getTempTrend() {
    return MeteoMath.calculateTrend(
        extractDataPoints(WeatherRecord::getTemperature), ChronoUnit.HOURS);
  }

  public TrendResult getPressureTrend() {
    return MeteoMath.calculateTrend(
        extractDataPoints(WeatherRecord::getPressure), ChronoUnit.HOURS);
  }
}
