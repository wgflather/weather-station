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
    try {
      return openMeteoClient
          .get()
          .uri(
              uriBuilder ->
                  uriBuilder
                      .path("/forecast")
                      .queryParam("latitude", lat)
                      .queryParam("longitude", lon)
                      .queryParam(
                          "hourly",
                          "cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,precipitation_probability,rain,showers,snowfall,wind_speed_10m,wind_speed_200hPa")
                      .queryParam("forecast_days", 2)
                      .build())
          .retrieve()
          .body(WeatherResponse.class);

    } catch (RestClientException e) {
      throw new RestClientException("Couldn't fetch data from Open meteo", e);
    }
  }
}
