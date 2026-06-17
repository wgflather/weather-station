package com.flather.weatherstation.client;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.dto.forecast.WeatherResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Slf4j
@RequiredArgsConstructor
@Service
public class OpenMeteoProvider {

  private final RestClient openMeteoClient;
  private final ConfigurationCache configurationCache;

  @Cacheable(value = "apiWeather", key = "T(java.lang.String).format('%.5f_%.5f', #lat, #lon)")
  public WeatherResponse fetchWeather(Double lat, Double lon) {
    String currentWeatherQuery =
        configurationCache.getDataProviderConfiguration().generateApiQueryParam();
    // Base hourly variables always fetched for cloud strip + astro forecast.
    String hourlyBase =
        "weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,"
            + "precipitation_probability,rain,showers,snowfall,wind_speed_10m,wind_speed_200hPa";
    // Append metric-specific variables only when at least one metric uses the external API.
    String hourlyQuery =
        currentWeatherQuery.isEmpty() ? hourlyBase : hourlyBase + "," + currentWeatherQuery;
    try {
      return openMeteoClient
          .get()
          .uri(
              uriBuilder -> {
                var b =
                    uriBuilder
                        .path("/forecast")
                        .queryParam("latitude", lat)
                        .queryParam("longitude", lon)
                        .queryParam("hourly", hourlyQuery)
                        .queryParam("forecast_days", 2);
                if (!currentWeatherQuery.isEmpty()) {
                  b = b.queryParam("current", currentWeatherQuery);
                }
                return b.build();
              })
          .retrieve()
          .body(WeatherResponse.class);
    } catch (RestClientException e) {
      throw new RestClientException("Couldn't fetch data from Open meteo", e);
    }
  }
}
