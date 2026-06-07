package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.SensorStateCache;
import com.flather.weatherstation.config.HardwareConfig;
import com.flather.weatherstation.config.TimezoneProperties;
import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.constant.DataStatus;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.constant.TrendDirection;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.dto.analytics.*;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import com.flather.weatherstation.mapper.MetricDataDetailsMapper;
import com.flather.weatherstation.repository.DateRangeHelper;
import com.flather.weatherstation.repository.WeatherReportRepository;
import java.time.*;
import java.util.*;
import java.util.function.Function;
import org.apache.commons.math3.stat.regression.SimpleRegression;
import org.apache.commons.math3.util.Precision;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class AnalyticsService {
  private final WeatherReportRepository repository;
  private final ZoneId zoneId;
  private final SensorStateCache sensorStateCache;
  private final MetricDataDetailsMapper metricDataDetailsMapper;
  private final HardwareConfig hardwareConfig;

  public AnalyticsService(
      WeatherReportRepository repository,
      TimezoneProperties timezoneProperties,
      SensorStateCache sensorStateCache,
      MetricDataDetailsMapper metricDataDetailsMapper,
      HardwareConfig hardwareConfig) {
    this.repository = repository;
    this.zoneId = timezoneProperties.getZoneId();
    this.sensorStateCache = sensorStateCache;
    this.metricDataDetailsMapper = metricDataDetailsMapper;
    this.hardwareConfig = hardwareConfig;
  }

  private DateRangeHelper.DateRange today() {
    return DateRangeHelper.getDateRange(zoneId);
  }

  public long findTodayRecordsCount() {
    var range = today();
    return repository.findRecordsBetween(range.startTime(), range.endTime());
  }

  public ZonedDateTime findLastRecordTime() {
    if (sensorStateCache.getLastSavedMeasurement() != null) {
      return sensorStateCache.getLastSavedMeasurement().getMeasuredAt().atZone(zoneId);
    }

    return null;
  }

  public long getLagMinutes(ZonedDateTime lastRecord) {
    return Duration.between(lastRecord, Instant.now().atZone(zoneId)).toMinutes();
  }

  private Double averageOfFiveLastReadings(Function<WeatherRecord, Double> valueExtractor,
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

  private List<DataPoint> extractDataPoints(
      Function<WeatherRecord, Double> valueExtractor) {

    return sensorStateCache.getMetricsWindow().stream()
        .map(
            record ->
                new DataPoint(
                    record.getMeasuredAt(), valueExtractor.apply(record)))
        .toList();
  }

  public TemperatureDto getTemperature() {
    return new TemperatureDto(
        averageOfFiveLastReadings(WeatherRecord::getTemperature, WeatherRecord::getTemperatureDataQuality),
        getTempTrend(),
        sensorStateCache.getTodayMinTemp(),
        sensorStateCache.getTodayMaxTemp(),
            metricDataDetailsMapper.from(sensorStateCache.getLastSavedMeasurement(), Metric.TEMPERATURE, hardwareConfig));
  }

  public PressureDto getPressure() {
    return new PressureDto(
        averageOfFiveLastReadings(WeatherRecord::getPressure, WeatherRecord::getPressureDataQuality), getPressureTrend(),
            metricDataDetailsMapper.from(sensorStateCache.getLastSavedMeasurement(), Metric.PRESSURE, hardwareConfig));
  }

  public HumidityDto getHumidity() {
    return new HumidityDto(averageOfFiveLastReadings(WeatherRecord::getHumidity, WeatherRecord::getHumidityDataQuality),
            metricDataDetailsMapper.from(sensorStateCache.getLastSavedMeasurement(), Metric.HUMIDITY, hardwareConfig));
  }

  public SurfaceWetnessDto getSurfaceWetness(){
    return new SurfaceWetnessDto(sensorStateCache.getMetricsWindow().getLast().getSurfaceWetness(),
            metricDataDetailsMapper.from(sensorStateCache.getLastSavedMeasurement(), Metric.SURFACE_WETNESS, hardwareConfig));
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
                new HourlyChartAvgDto(projection.hour().atZone(zoneId), projection.value()))
        .toList();
  }

  public ChartDto returnChart(Metric metric, String since, String resolution) {
    Instant sinceInstant =
        (since == null)
            ? LocalDate.now(zoneId).atStartOfDay(zoneId).toInstant()
            : OffsetDateTime.parse(since).toInstant();

    List<HourlyChartAvgDto> dtos = getMetricChart(sinceInstant, metric, resolution);

    Instant nextBucketExpectedAt = null;

    if (!dtos.isEmpty()) {
      nextBucketExpectedAt = getNextExpectedBucketEpochMillis(dtos.getLast().hour(), Integer.parseInt(resolution));
    }

    return new ChartDto(metric.getName(), dtos, nextBucketExpectedAt);
  }

  private Instant getNextExpectedBucketEpochMillis(ZonedDateTime zonedDateTime, int resolution) {
    return zonedDateTime.toInstant().plusSeconds(Duration.ofMinutes(resolution).toSeconds());
  }

  public TrendResult getTempTrend() {
    return calculateTrend(extractDataPoints(WeatherRecord::getTemperature));
  }

  public TrendResult getPressureTrend() {
    return calculateTrend(extractDataPoints(WeatherRecord::getPressure));
  }

  public TrendResult calculateTrend(List<DataPoint> dataPoints) {
    if (dataPoints.isEmpty()) {
      return new TrendResult(0.0, TrendDirection.STABLE);
    }

    List<DataPoint> filteredPoints =
        dataPoints.stream().filter(dataPoint -> dataPoint.value() != null).toList();

    if (filteredPoints.size() < 2) {
      return new TrendResult(0.0, TrendDirection.STABLE);
    }

    Instant firstDataTime = filteredPoints.getFirst().hour();

    SimpleRegression regression = new SimpleRegression();

    for (DataPoint point : filteredPoints) {
      double x = Duration.between(firstDataTime, point.hour()).toMillis() / 1000.0;

      double y = point.value();

      regression.addData(x, y);
    }

    double slope = regression.getSlope();

    double hourlyChange = slope * 3600.0;

    hourlyChange = Math.round(hourlyChange * 10.0) / 10.0;

    TrendDirection direction;

    if (Math.abs(hourlyChange) < 0.15) {
      direction = TrendDirection.STABLE;
      hourlyChange = 0.0;
    } else if (hourlyChange > 0) {
      direction = TrendDirection.UP;
    } else {
      direction = TrendDirection.DOWN;
    }
    return new TrendResult(hourlyChange, direction);
  }
}
