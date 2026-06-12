package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.cache.SensorStateCache;
import com.flather.weatherstation.config.HardwareConfig;
import com.flather.weatherstation.domain.constant.*;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.dto.analytics.*;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.mapper.MetricDataDetailsMapper;
import com.flather.weatherstation.repository.DateRangeHelper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import java.time.*;
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
  private final HardwareConfig hardwareConfig;
  private final ConfigurationCache configurationCache;

  public AnalyticsService(
      WeatherReportRepository repository,
      ConfigurationCache configurationCache,
      SensorStateCache sensorStateCache,
      MetricDataDetailsMapper metricDataDetailsMapper,
      HardwareConfig hardwareConfig) {
    this.repository = repository;
    this.sensorStateCache = sensorStateCache;
    this.metricDataDetailsMapper = metricDataDetailsMapper;
    this.hardwareConfig = hardwareConfig;
    this.configurationCache = configurationCache;
  }

  private DateRangeHelper.DateRange today() {
    return DateRangeHelper.getDateRange(configurationCache.getLocationContext().zoneId());
  }

  public long findTodayRecordsCount() {
    var range = today();
    return repository.findRecordsBetween(range.startTime(), range.endTime());
  }

  public ZonedDateTime findLastRecordTime() {
    if (sensorStateCache.getLastSavedMeasurement() != null) {
      return sensorStateCache
          .getLastSavedMeasurement()
          .getMeasuredAt()
          .atZone(configurationCache.getLocationContext().zoneId());
    }

    return null;
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
            sensorStateCache.getLastSavedMeasurement(), Metric.TEMPERATURE, hardwareConfig));
  }

  public PressureDto getPressure() {
    TrendResult trendResult = getPressureTrend();
    return new PressureDto(
        averageOfFiveLastReadings(
            WeatherRecord::getPressure, WeatherRecord::getPressureDataQuality),
        trendResult,
        metricDataDetailsMapper.from(
            sensorStateCache.getLastSavedMeasurement(), Metric.PRESSURE, hardwareConfig),
        PressureTrend.classify(trendResult));
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
        metricDataDetailsMapper.from(
            sensorStateCache.getLastSavedMeasurement(), Metric.HUMIDITY, hardwareConfig),
        dewPoint,
        dewPointRisk);
  }

  public SurfaceWetnessDto getSurfaceWetness() {
    long rawAdc = sensorStateCache.getMetricsWindow().getLast().getSurfaceWetness();
    double pctWetness =
        MeteoMath.rawToWetnessPct(
            rawAdc,
            configurationCache.getValidationConfig().surfaceWetnessDryBaseline(),
            configurationCache.getValidationConfig().surfaceWetnessWetBaseline());

    return new SurfaceWetnessDto(
        pctWetness,
        metricDataDetailsMapper.from(
            sensorStateCache.getLastSavedMeasurement(), Metric.SURFACE_WETNESS, hardwareConfig),
        SurfaceWetnessStatus.classify(pctWetness));
  }

  public List<HourlyChartAvgDto> getMetricChart(Instant since, Metric metric, String resolution) {
    String bucketInterval = resolution + "minutes";
    switch (metric) {
      case TEMPERATURE -> {
        return dataPointToDto(repository.findChartTemperature(since, bucketInterval));
      }
      case PRESSURE -> {
        return dataPointToDto(repository.findChartPressure(since, bucketInterval));
      }
      case HUMIDITY -> {
        return dataPointToDto(repository.findChartHumidity(since, bucketInterval));
      }
      default -> throw new IllegalArgumentException("Unknown Metric");
    }
  }

  private List<HourlyChartAvgDto> dataPointToDto(List<DataPoint> dataPoints) {
    return dataPoints.stream()
        .map(
            projection ->
                new HourlyChartAvgDto(
                    projection.hour().atZone(configurationCache.getLocationContext().zoneId()),
                    projection.value()))
        .toList();
  }

  public ChartDto returnChart(Metric metric, String since, String resolution) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();
    Instant sinceInstant =
        (since == null)
            ? LocalDate.now(zoneId).atStartOfDay(zoneId).toInstant()
            : OffsetDateTime.parse(since).toInstant();

    List<HourlyChartAvgDto> dtos = getMetricChart(sinceInstant, metric, resolution);

    Instant nextBucketExpectedAt = null;

    if (!dtos.isEmpty()) {
      nextBucketExpectedAt =
          getNextExpectedBucketEpochMillis(dtos.getLast().hour(), Integer.parseInt(resolution));
    }

    return new ChartDto(metric.getName(), dtos, nextBucketExpectedAt);
  }

  private Instant getNextExpectedBucketEpochMillis(ZonedDateTime zonedDateTime, int resolution) {
    return zonedDateTime.toInstant().plusSeconds(Duration.ofMinutes(resolution).toSeconds());
  }

  public TrendResult getTempTrend() {
    return MeteoMath.calculateTrend(extractDataPoints(WeatherRecord::getTemperature));
  }

  public TrendResult getPressureTrend() {
    return MeteoMath.calculateTrend(extractDataPoints(WeatherRecord::getPressure));
  }
}
