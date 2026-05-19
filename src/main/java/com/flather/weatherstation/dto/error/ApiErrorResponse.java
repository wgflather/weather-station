package com.flather.weatherstation.dto.error;

import java.net.URI;
import java.time.Instant;

public record ApiErrorResponse(
    Instant timestamp, int status, String error, String message, URI path) {}
