package com.flather.weatherstation.dto.forecast;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;

/**
 * @param fetchedAt when this response came over the wire — not part of Open-Meteo's payload,
 *     stamped by {@code OpenMeteoProvider}. It travels with the response because the response
 *     outlives the fetch twice over: in the 20-minute cache, and as the last-good forecast during
 *     an outage.
 */
public record WeatherResponse(
    @JsonProperty("hourly") WeatherConditionsForecast hourly,
    @JsonProperty("hourly_units") WeatherHourlyUnits units,
    @JsonProperty("current") CurrentWeather currentWeather,
    Instant fetchedAt) {

  public WeatherResponse withFetchedAt(Instant fetchedAt) {
    return new WeatherResponse(hourly, units, currentWeather, fetchedAt);
  }

  /** Enough of an hourly block to draw the forecast strip from. */
  public boolean hasForecast() {
    return hourly != null && hourly.time() != null && !hourly.time().isEmpty() && units != null;
  }
}
