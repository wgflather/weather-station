package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.SensorStateCache;
import com.flather.weatherstation.config.TimezoneProperties;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.constant.TrendDirection;
import com.flather.weatherstation.dto.analytics.*;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
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

  public AnalyticsService(
      WeatherReportRepository repository,
      TimezoneProperties timezoneProperties,
      SensorStateCache sensorStateCache) {
    this.repository = repository;
    this.zoneId = timezoneProperties.getZoneId();
    this.sensorStateCache = sensorStateCache;
  }

  private DateRangeHelper.DateRange today() {
    return DateRangeHelper.getDateRange(zoneId);
  }

  public long findTodayRecordsCount() {
    var range = today();
    return repository.findRecordsBetween(range.startTime(), range.endTime());
  }

  public ZonedDateTime findLastRecordTime() {
    if (sensorStateCache.getLastSavedMeasurementAt() != null) {
      return sensorStateCache.getLastSavedMeasurementAt().atZone(zoneId);
    }

    return null;
  }

  public long getLagMinutes(ZonedDateTime lastRecord) {
    return Duration.between(lastRecord, Instant.now().atZone(zoneId)).toMinutes();
  }

  private Double averageOfFiveLastReadings(Function<WeatherRecordResponseDto, Double> extractor) {

    OptionalDouble avg =
        sensorStateCache.getMetricsWindow().reversed().stream()
            .map(extractor)
            .filter(Objects::nonNull)
            .limit(5)
            .mapToDouble(Double::doubleValue)
            .average();

    return avg.isPresent() ? Precision.round(avg.getAsDouble(), 1) : null;
  }

  private List<DataPoint> extractDataPoints(
      Function<WeatherRecordResponseDto, Double> valueExtractor) {

    return sensorStateCache.getMetricsWindow().stream()
        .map(
            record ->
                new DataPoint(
                    record.getMeasuredAtTimeZoned().toInstant(), valueExtractor.apply(record)))
        .toList();
  }

  public TemperatureDto getTemperature() {
    return new TemperatureDto(
        averageOfFiveLastReadings(WeatherRecordResponseDto::getTemperature),
        getTempTrend(),
        sensorStateCache.getTodayMinTemp(),
        sensorStateCache.getTodayMaxTemp());
  }

  public PressureDto getPressure() {
    return new PressureDto(
        averageOfFiveLastReadings(WeatherRecordResponseDto::getPressure), getPressureTrend());
  }

  public HumidityDto getHumidity() {
    return new HumidityDto(averageOfFiveLastReadings(WeatherRecordResponseDto::getHumidity));
  }

  public SurfaceWetnessDto getSurfaceWetness(){
    return new SurfaceWetnessDto(sensorStateCache.getMetricsWindow().getLast().getSurfaceWetness());
  }

  public List<HourlyChartAvgDto> getMetricChart(Instant since, Metric metric) {
    switch (metric) {
      case TEMPERATURE -> {
        return dataPointToDto(repository.findChartTemperature(since));
      }
      case PRESSURE -> {
        return dataPointToDto(repository.findChartPressure(since));
      }
      case HUMIDITY -> {
        return dataPointToDto(repository.findChartHumidity(since));
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

  public ChartDto returnChart(Metric metric, String since) {
    Instant sinceInstant =
        (since == null)
            ? LocalDate.now(zoneId).atStartOfDay(zoneId).toInstant()
            : OffsetDateTime.parse(since).toInstant();

    List<HourlyChartAvgDto> dtos = getMetricChart(sinceInstant, metric);

    Instant nextBucketExpectedAt = null;

    if (!dtos.isEmpty()) {
      nextBucketExpectedAt = getNextExpectedBucketEpochMillis(dtos.getLast().hour());
    }

    return new ChartDto(metric.getName(), dtos, nextBucketExpectedAt);
  }

  private Instant getNextExpectedBucketEpochMillis(ZonedDateTime zonedDateTime) {
    return zonedDateTime.toInstant().plusSeconds(600);
  }

  public TrendResult getTempTrend() {
    return calculateTrend(extractDataPoints(WeatherRecordResponseDto::getTemperature));
  }

  public TrendResult getPressureTrend() {
    return calculateTrend(extractDataPoints(WeatherRecordResponseDto::getPressure));
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
