package com.flather.weatherstation.service;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.client.OpenMeteoProvider;
import com.flather.weatherstation.dto.forecast.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.ZoneId;
import java.util.List;
import java.util.stream.IntStream;

@Service
@RequiredArgsConstructor
public class WeatherClientService {
    private final OpenMeteoProvider client;
    private final ConfigurationCache configurationCache;

    public ForecastDto getForecast() {
        WeatherResponse response = client.fetchWeather(
                configurationCache.getLatitude(),
                configurationCache.getLongitude()
        );
        return new ForecastDto(response.units(), mapToConditionPoints(response.hourly()));
    }

    private List<WeatherConditionPoint> mapToConditionPoints(WeatherConditionsForecast forecast) {
        ZoneId zoneId = configurationCache.getLocationContext().zoneId();
        return IntStream.range(0, forecast.time().size())
                .mapToObj(i -> new WeatherConditionPoint(
                        forecast.time().get(i).atZone(zoneId),
                        forecast.totalCloudCoverage().get(i),
                        forecast.precipitationProbability().get(i),
                        forecast.rainAmount().get(i),
                        forecast.snowFallAmount().get(i),
                        forecast.showerAmount().get(i)

                )).toList();
    }

}
