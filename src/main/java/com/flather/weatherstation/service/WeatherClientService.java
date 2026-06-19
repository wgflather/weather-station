package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.client.OpenMeteoProvider;
import com.flather.weatherstation.domain.constant.BeaufortScale;
import com.flather.weatherstation.domain.constant.DataProvider;
import com.flather.weatherstation.domain.constant.DewPointRisk;
import com.flather.weatherstation.domain.constant.Metric;
import com.flather.weatherstation.domain.constant.PressureTrend;
import com.flather.weatherstation.domain.constant.TrendDirection;
import com.flather.weatherstation.domain.constant.UvLevel;
import com.flather.weatherstation.domain.constant.WindDirectionLabel;
import com.flather.weatherstation.dto.analytics.*;
import com.flather.weatherstation.dto.dashboard.ChartDto;
import com.flather.weatherstation.dto.forecast.*;
import com.flather.weatherstation.mapper.MetricDataDetailsMapper;
import com.flather.weatherstation.util.MeteoMath;
import java.time.*;
import java.util.ArrayList;
import java.util.DoubleSummaryStatistics;
import java.util.List;
import java.util.stream.IntStream;
import lombok.RequiredArgsConstructor;
import org.apache.commons.math3.util.Precision;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WeatherClientService {
  private final OpenMeteoProvider client;
  private final ConfigurationCache configurationCache;
  private final MetricDataDetailsMapper metricDataDetailsMapper;
  private final Duration forecastChartTtl = Duration.ofMinutes(10);

  public ForecastDto getForecast() {
    WeatherResponse response =
        client.fetchWeather(configurationCache.getLatitude(), configurationCache.getLongitude());
    return new ForecastDto(response.units(), mapToConditionPoints(response.hourly()));
  }

  public AstroForecastDto getAstroForecast() {
    WeatherConditionsForecast f =
        client
            .fetchWeather(configurationCache.getLatitude(), configurationCache.getLongitude())
            .hourly();
    ZoneId zone = configurationCache.getLocationContext().zoneId();
    List<AstroForecastPoint> points =
        IntStream.range(0, f.time().size())
            .mapToObj(
                i -> {
                  double windSurface = safe(f.windSpeed10m(), i);
                  double jetStream = safe(f.windSpeed200hPa(), i);
                  double seeing = SeeingCalculator.seeing(jetStream, windSurface);
                  return new AstroForecastPoint(
                      f.time().get(i).atZone(zone),
                      safe(f.cloudCoverLow(), i),
                      safe(f.cloudCoverMid(), i),
                      safe(f.cloudCoverHigh(), i),
                      windSurface,
                      jetStream,
                      Math.round(seeing * 10.0) / 10.0,
                      SeeingCalculator.label(seeing),
                      SeeingCalculator.score(seeing));
                })
            .toList();
    return new AstroForecastDto(points);
  }

  public TemperatureDto getTemperature(WeatherResponse response) {
    CurrentWeather current = response.currentWeather();
    WeatherConditionsForecast hourly = response.hourly();
    ZoneId zone = configurationCache.getLocationContext().zoneId();

    LocalDateTime now = LocalDateTime.now(zone);
    LocalDate today = now.toLocalDate();

    DoubleSummaryStatistics stats =
        IntStream.range(0, hourly.time().size())
            .filter(
                i -> {
                  LocalDateTime t = hourly.time().get(i);
                  return t.toLocalDate().equals(today)
                      && !t.isAfter(now)
                      && hourly.temperature2m() != null
                      && i < hourly.temperature2m().size()
                      && hourly.temperature2m().get(i) != null;
                })
            .mapToDouble(i -> hourly.temperature2m().get(i))
            .summaryStatistics();

    Double min = stats.getCount() > 0 ? Precision.round(stats.getMin(), 1) : null;
    Double max = stats.getCount() > 0 ? Precision.round(stats.getMax(), 1) : null;

    TrendResult trend = computeHourlyTrend(hourly.temperature2m(), hourly.time(), now);

    return new TemperatureDto(
        current.temperature(),
        trend,
        min,
        max,
        metricDataDetailsMapper.fromApi(
            Metric.TEMPERATURE, current.temperature(), current.time().atZone(zone)));
  }

  public PressureDto getPressure(WeatherResponse response) {
    CurrentWeather current = response.currentWeather();
    WeatherConditionsForecast hourly = response.hourly();
    ZoneId zone = configurationCache.getLocationContext().zoneId();

    TrendResult trend =
        computeHourlyTrend(hourly.surfacePressure(), hourly.time(), LocalDateTime.now(zone));
    MetricDataDetails details =
        metricDataDetailsMapper.fromApi(
            Metric.PRESSURE, current.pressure(), current.time().atZone(zone));

    return new PressureDto(current.pressure(), trend, details, PressureTrend.classify(trend));
  }

  public HumidityDto getHumidity(WeatherResponse response) {
    CurrentWeather current = response.currentWeather();
    ZoneId zone = configurationCache.getLocationContext().zoneId();

    Double dewPoint = null;
    DewPointRisk dewPointRisk = null;

    boolean tempAlsoFromApi =
        configurationCache.getDataProviderConfiguration().temperature()
            == DataProvider.EXTERNAL_API;
    if (tempAlsoFromApi && current.temperature() != null && current.humidity() != null) {
      dewPoint = MeteoMath.calculateDewPoint(current.temperature(), current.humidity());
      dewPointRisk = DewPointRisk.classify(current.temperature() - dewPoint);
    }

    MetricDataDetails details =
        metricDataDetailsMapper.fromApi(
            Metric.HUMIDITY, current.humidity(), current.time().atZone(zone));

    return new HumidityDto(current.humidity(), details, dewPoint, dewPointRisk);
  }

  public WindDto getWind(WeatherResponse response) {
    CurrentWeather current = response.currentWeather();
    ZoneId zone = configurationCache.getLocationContext().zoneId();

    Double direction = current.windDirection();
    WindDirectionLabel dirLabel =
        direction != null ? WindDirectionLabel.fromDegrees(direction) : null;

    Double speed = current.windSpeed();
    Double guests = current.windGusts();

    MetricDataDetails details =
        metricDataDetailsMapper.fromApi(Metric.WIND, speed, current.time().atZone(zone));

    return new WindDto(speed, guests, direction, dirLabel, BeaufortScale.fromMs(speed), details);
  }

  public UvIndexDto getUvIndex(WeatherResponse response) {
    CurrentWeather current = response.currentWeather();
    ZoneId zone = configurationCache.getLocationContext().zoneId();

    MetricDataDetails details =
        metricDataDetailsMapper.fromApi(
            Metric.UV_INDEX, current.uvIndex(), current.time().atZone(zone));

    return new UvIndexDto(current.uvIndex(), UvLevel.fromIndex(current.uvIndex()), details);
  }

  public ChartDto getChart(Metric metric) {
    WeatherResponse response =
        client.fetchWeather(configurationCache.getLatitude(), configurationCache.getLongitude());
    WeatherConditionsForecast forecast = response.hourly();

    List<LocalDateTime> time = forecast.time();

    List<ChartPointDto> points =
        switch (metric) {
          case TEMPERATURE -> mapToChartPoints(time, forecast.temperature2m());
          case PRESSURE -> mapToChartPoints(time, forecast.surfacePressure());
          case HUMIDITY -> mapToChartPoints(time, forecast.relativeHumidity2m());
          case WIND -> mapToChartPoints(time, forecast.windSpeed10m());

          case UV_INDEX -> mapToChartPoints(time, forecast.uvIndex());
          default -> throw new IllegalArgumentException("This metric is not supported for charts");
        };

    return new ChartDto(
        metric.toString(),
        points,
        Instant.now().plus(forecastChartTtl),
        DataProvider.EXTERNAL_API);
  }

  private TrendResult computeHourlyTrend(
      List<Double> values, List<LocalDateTime> times, LocalDateTime now) {
    if (values == null || times == null || values.size() < 2) {
      return new TrendResult(0.0, TrendDirection.STABLE);
    }

    int curIdx = -1;
    for (int i = times.size() - 1; i >= 0; i--) {
      if (!times.get(i).isAfter(now)) {
        curIdx = i;
        break;
      }
    }

    if (curIdx < 1) return new TrendResult(0.0, TrendDirection.STABLE);

    Double cur = values.get(curIdx);
    Double prev = values.get(curIdx - 1);

    if (cur == null || prev == null) return new TrendResult(0.0, TrendDirection.STABLE);

    return MeteoMath.trendFromHourlyChange(cur - prev);
  }

  private List<ChartPointDto> mapToChartPoints(List<LocalDateTime> time, List<Double> values) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();

    if (time == null || values == null || time.isEmpty() || values.isEmpty()) {
      return List.of();
    }

    int count = Math.min(24, Math.min(time.size(), values.size()));

    List<ChartPointDto> points = new ArrayList<>();
    for (int i = 0; i < count; i++) {
      Double val = values.get(i);
      if (val != null) {
        points.add(new ChartPointDto(time.get(i).atZone(zoneId), val));
      }
    }

    return points;
  }

  public WeatherResponse getWeatherResponse() {
    return client.fetchWeather(configurationCache.getLatitude(), configurationCache.getLongitude());
  }

  private List<WeatherConditionPoint> mapToConditionPoints(WeatherConditionsForecast forecast) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();
    return IntStream.range(0, forecast.time().size())
        .mapToObj(
            i ->
                new WeatherConditionPoint(
                    forecast.time().get(i).atZone(zoneId),
                    safeInt(forecast.weatherCodes(), i),
                    forecast.totalCloudCoverage().get(i),
                    safeNullable(forecast.cloudCoverLow(), i),
                    safeNullable(forecast.cloudCoverMid(), i),
                    safeNullable(forecast.cloudCoverHigh(), i),
                    forecast.precipitationProbability().get(i),
                    forecast.rainAmount().get(i),
                    forecast.snowFallAmount().get(i),
                    forecast.showerAmount().get(i),
                    safeNullable(forecast.temperature2m(), i),
                    safeNullable(forecast.relativeHumidity2m(), i),
                    safeNullable(forecast.surfacePressure(), i),
                    safeNullable(forecast.windSpeed10m(), i),
                    safeNullable(forecast.windGusts10m(), i),
                    safeNullable(forecast.uvIndex(), i)))
        .toList();
  }

  // Returns null when the list is absent (metric not on external API) rather than 0.0,
  // so the frontend can distinguish "no data" from "value is zero".
  private static Double safeNullable(List<Double> list, int i) {
    if (list == null || i >= list.size()) return null;
    return list.get(i);
  }

  private static double safe(List<Double> list, int i) {
    if (list == null || i >= list.size() || list.get(i) == null) return 0.0;
    return list.get(i);
  }

  private static Integer safeInt(List<Integer> list, int i) {
    if (list == null || i >= list.size()) return null;
    return list.get(i);
  }
}
