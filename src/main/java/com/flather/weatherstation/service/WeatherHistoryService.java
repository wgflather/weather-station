package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.entity.DailyWeatherRecord;
import com.flather.weatherstation.dto.analytics.ChartPointDto;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.projection.DataPoint;
import com.flather.weatherstation.dto.weather.DailyWeatherRecordDto;
import com.flather.weatherstation.dto.weather.HourlyWeatherRecordDto;
import com.flather.weatherstation.mapper.WeatherHistoryMapper;
import com.flather.weatherstation.repository.DailyWeatherRecordRepository;
import com.flather.weatherstation.repository.HourlyWeatherRecordRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.NoSuchElementException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WeatherHistoryService {

  private static final int RAW_RETENTION_DAYS = 30;

  private final HourlyWeatherRecordRepository hourlyRepository;
  private final DailyWeatherRecordRepository dailyRepository;
  private final AnalyticsService analyticsService;
  private final ConfigurationCache configurationCache;
  private final WeatherHistoryMapper mapper;

  public ChartDto getDayChart(LocalDate date, Metric metric) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();
    Instant from = date.atStartOfDay(zoneId).toInstant();
    Instant to = date.plusDays(1).atStartOfDay(zoneId).toInstant();
    return getChart(metric, from, to);
  }

  public ChartDto getDailyChartPoints(LocalDate from, LocalDate to, Metric metric) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();
    List<ChartPointDto> dtos =
        dailyRepository.findByDateBetweenOrderByDateAsc(from, to).stream()
            .map(r -> new ChartPointDto(r.getDate().atStartOfDay(zoneId), metricValue(r, metric)))
            .toList();
    return new ChartDto(metric.getName(), dtos, null);
  }

  public ChartDto getChart(Metric metric, Instant from, Instant to) {
    Instant rawCutoff = Instant.now().minus(RAW_RETENTION_DAYS, ChronoUnit.DAYS);

    List<ChartPointDto> dtos =
        from.isBefore(rawCutoff)
            ? toChartDtos(findHourlyDataPoints(metric, from, to))
            : analyticsService.getMetricChart(from, to, metric, 60);

    return new ChartDto(metric.getName(), dtos, null);
  }

  public List<HourlyWeatherRecordDto> getHourlyHistory(Instant from, Instant to) {
    return mapper.toHourlyDtoList(hourlyRepository.findByHourBetweenOrderByHourAsc(from, to));
  }

  public List<DailyWeatherRecordDto> getDailyHistory(LocalDate from, LocalDate to) {
    return mapper.toDailyDtoList(dailyRepository.findByDateBetweenOrderByDateAsc(from, to));
  }

  public List<LocalDate> getAvailableDates(LocalDate from, LocalDate to) {
    return dailyRepository.findDatesBetween(from, to);
  }

  public DailyWeatherRecordDto getHistoryDailySummary(LocalDate date) {
    return dailyRepository
        .findByDate(date)
        .map(mapper::toDto)
        .orElseThrow(() -> new NoSuchElementException("No daily summary for date: " + date));
  }

  private double metricValue(DailyWeatherRecord r, Metric metric) {
    return switch (metric) {
      case TEMPERATURE -> r.getTemperatureAvg();
      case PRESSURE -> r.getPressureAvg();
      case HUMIDITY -> r.getHumidityAvg();
      default ->
          throw new IllegalArgumentException("Unsupported metric for daily chart: " + metric);
    };
  }

  private List<DataPoint> findHourlyDataPoints(Metric metric, Instant from, Instant to) {
    return switch (metric) {
      case TEMPERATURE -> hourlyRepository.findChartTemperature(from, to);
      case PRESSURE -> hourlyRepository.findChartPressure(from, to);
      case HUMIDITY -> hourlyRepository.findChartHumidity(from, to);
      default ->
          throw new IllegalArgumentException("Unsupported metric for history chart: " + metric);
    };
  }

  private List<ChartPointDto> toChartDtos(List<DataPoint> points) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();
    return points.stream().map(p -> new ChartPointDto(p.hour().atZone(zoneId), p.value())).toList();
  }
}
