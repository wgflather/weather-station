package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.client.OpenMeteoProvider;
import com.flather.weatherstation.dto.forecast.*;
import java.time.ZoneId;
import java.util.List;
import java.util.stream.IntStream;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class WeatherClientService {
  private final OpenMeteoProvider client;
  private final ConfigurationCache configurationCache;

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

  private List<WeatherConditionPoint> mapToConditionPoints(WeatherConditionsForecast forecast) {
    ZoneId zoneId = configurationCache.getLocationContext().zoneId();
    return IntStream.range(0, forecast.time().size())
        .mapToObj(
            i ->
                new WeatherConditionPoint(
                    forecast.time().get(i).atZone(zoneId),
                    safeInt(forecast.weatherCodes(), i),
                    forecast.totalCloudCoverage().get(i),
                    forecast.precipitationProbability().get(i),
                    forecast.rainAmount().get(i),
                    forecast.snowFallAmount().get(i),
                    forecast.showerAmount().get(i)))
        .toList();
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
