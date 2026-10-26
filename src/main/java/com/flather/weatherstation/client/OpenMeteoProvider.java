package com.flather.weatherstation.client;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.domain.constant.ExternalApiStatus;
import com.flather.weatherstation.domain.event.LocationUpdatedEvent;
import com.flather.weatherstation.dto.forecast.WeatherResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Slf4j
@RequiredArgsConstructor
@Service
public class OpenMeteoProvider {

  /**
   * After a failed fetch, calls within this window return null without touching the network. A
   * failure is not cached (it would block recovery for the cache's whole 20 minutes), so without
   * this every caller — each client's strip check, chart refresh and live poll — would make its own
   * request to an API that is down, each waiting out the client timeout.
   */
  private static final Duration RETRY_AFTER = Duration.ofSeconds(60);

  /** The strip shows this far ahead; a last-good forecast that ends sooner has nothing to show. */
  private static final Duration FORECAST_HORIZON = Duration.ofHours(8);

  private final RestClient openMeteoClient;
  private final ConfigurationCache configurationCache;

  private final AtomicReference<ExternalApiStatus> status =
      new AtomicReference<>(ExternalApiStatus.UNKNOWN);
  private volatile Instant lastFailureAt;
  private volatile WeatherResponse lastValidForecast;

  @Cacheable(
      value = "apiWeather",
      key = "T(java.lang.String).format('%.5f_%.5f', #lat, #lon)",
      unless = "#result == null")
  public WeatherResponse fetchWeather(Double lat, Double lon) {
    if (inBackoff()) {
      return null;
    }
    String currentWeatherQuery =
        configurationCache.getDataProviderConfiguration().generateApiQueryParam();
    String hourlyBase =
        "weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,"
            + "precipitation_probability,rain,showers,snowfall,wind_speed_10m";
    // Append metric-specific variables only when at least one metric uses the external API.
    String hourlyQuery =
        currentWeatherQuery.isEmpty() ? hourlyBase : hourlyBase + "," + currentWeatherQuery;
    try {
      WeatherResponse response =
          openMeteoClient
              .get()
              .uri(
                  uriBuilder -> {
                    var b =
                        uriBuilder
                            .path("/forecast")
                            .queryParam("wind_speed_unit", "ms")
                            .queryParam("latitude", lat)
                            .queryParam("longitude", lon)
                            .queryParam("hourly", hourlyQuery)
                            .queryParam("forecast_days", 2)
                            .queryParam(
                                "timezone",
                                configurationCache.getLocationContext().zoneId().getId());
                    if (!currentWeatherQuery.isEmpty()) {
                      b = b.queryParam("current", currentWeatherQuery);
                    }
                    return b.build();
                  })
              .retrieve()
              .body(WeatherResponse.class);

      if (response == null) {
        markUnavailable("empty response body");
        return null;
      }
      response = response.withFetchedAt(Instant.now());
      if (response.hasForecast()) {
        lastValidForecast = response;
      }
      markAvailable();
      return response;
    } catch (RestClientException e) {
      // The wrapper's message names the URL; the cause says what went wrong (and a
      // refused connection carries no message of its own).
      markUnavailable(e.getMostSpecificCause().toString());
      return null;
    }
  }

  /**
   * The last response that carried a usable forecast, for the strip to fall back on while the API
   * is down. Empty once it no longer reaches {@link #FORECAST_HORIZON} past now — a 48-hour fetch
   * gets there around mid-afternoon the next day.
   */
  public Optional<WeatherResponse> getLastValidForecast() {
    WeatherResponse last = lastValidForecast;
    if (last == null) {
      return Optional.empty();
    }
    Instant forecastEnd =
        last.hourly()
            .time()
            .getLast()
            .atZone(configurationCache.getLocationContext().zoneId())
            .toInstant();
    return forecastEnd.isBefore(Instant.now().plus(FORECAST_HORIZON))
        ? Optional.empty()
        : Optional.of(last);
  }

  public ExternalApiStatus getExternalApiStatus() {
    return status.get();
  }

  /** A forecast for the old coordinates must not stand in for the new ones during an outage. */
  @EventListener
  public void onLocationUpdated(LocationUpdatedEvent event) {
    lastValidForecast = null;
  }

  private boolean inBackoff() {
    Instant failedAt = lastFailureAt;
    return status.get() == ExternalApiStatus.UNAVAILABLE
        && failedAt != null
        && Instant.now().isBefore(failedAt.plus(RETRY_AFTER));
  }

  // Logged on the transition only — an outage is one line when it starts and one when it ends,
  // not a stack trace per request.
  private void markAvailable() {
    if (status.getAndSet(ExternalApiStatus.AVAILABLE) == ExternalApiStatus.UNAVAILABLE) {
      log.info("Open-Meteo is reachable again");
    }
  }

  private void markUnavailable(String reason) {
    lastFailureAt = Instant.now();
    if (status.getAndSet(ExternalApiStatus.UNAVAILABLE) != ExternalApiStatus.UNAVAILABLE) {
      log.warn(
          "Open-Meteo is unreachable ({}); retrying at most every {} s",
          reason,
          RETRY_AFTER.toSeconds());
    }
  }
}
