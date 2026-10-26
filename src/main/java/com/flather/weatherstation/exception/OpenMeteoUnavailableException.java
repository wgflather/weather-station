package com.flather.weatherstation.exception;

/**
 * Open-Meteo could not answer and nothing usable was held back for it. Mapped to 503. Only thrown
 * where the whole response depends on the API — the forecast strip with no last-good copy left, and
 * an API-backed chart. The live dashboard never throws it: its local readings still stand, so it
 * reports the API's state in system health instead.
 */
public class OpenMeteoUnavailableException extends RuntimeException {
  public OpenMeteoUnavailableException(String message) {
    super(message);
  }
}
