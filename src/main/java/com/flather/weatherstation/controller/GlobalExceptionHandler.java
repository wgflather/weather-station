package com.flather.weatherstation.controller;

import com.flather.weatherstation.dto.error.ApiErrorResponse;
import jakarta.validation.ConstraintViolationException;
import java.net.URI;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

  /** Handles general exceptions that indicate a resource was not found. */
  @Override
  protected ResponseEntity<Object> handleNoResourceFoundException(
      NoResourceFoundException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {

    log.warn("Resource Not Found: {}", ex.getMessage());

    return buildErrorResponse(HttpStatus.NOT_FOUND, "Resource not found", request);
  }

  /** Handles validation errors for method arguments (e.g., @Valid failures). */
  @Override
  protected ResponseEntity<Object> handleMethodArgumentNotValid(
      MethodArgumentNotValidException ex,
      HttpHeaders headers,
      HttpStatusCode status,
      WebRequest request) {
    String errorMessage =
        ex.getBindingResult().getFieldErrors().stream()
            .map(error -> error.getField() + ": " + error.getDefaultMessage())
            .reduce((a, b) -> a + ", " + b)
            .orElse("Validation failed");

    log.warn("Method Argument Not Valid: {}", errorMessage);
    return buildErrorResponse(HttpStatus.BAD_REQUEST, errorMessage, request);
  }

  @ExceptionHandler(ConstraintViolationException.class)
  public ResponseEntity<Object> handleConstraintViolation(
      ConstraintViolationException ex, WebRequest request) {
    String errorMessage =
        ex.getConstraintViolations().stream()
            .map(
                constraintViolation ->
                    constraintViolation.getPropertyPath() + ": " + constraintViolation.getMessage())
            .reduce((a, b) -> a + ", " + b)
            .orElse("Validation failed");

    log.warn("Constraint Violation: {}", errorMessage);

    return buildErrorResponse(HttpStatus.UNPROCESSABLE_CONTENT, errorMessage, request);
  }

  /** Handles binding errors (e.g., JSON parsing failures). */
  @Override
  protected ResponseEntity<Object> handleHttpMessageNotReadable(
      HttpMessageNotReadableException ex,
      HttpHeaders headers,
      HttpStatusCode status,
      WebRequest request) {
    log.warn("HTTP Input Message Not Readable: {}", ex.getMessage());
    return buildErrorResponse(
        HttpStatus.BAD_REQUEST,
        "Invalid request body format. Please check the JSON structure.",
        request);
  }

  /** Generic handler for unexpected runtime exceptions. */
  @ExceptionHandler(Exception.class)
  protected ResponseEntity<Object> handleGlobalException(Exception ex, WebRequest request) {
    log.error("Global Exception Caught: {}", ex.getMessage(), ex);
    return buildErrorResponse(
        HttpStatus.INTERNAL_SERVER_ERROR,
        "An unexpected error occurred. Please try again later.",
        request);
  }

  @ExceptionHandler(DateTimeParseException.class)
  protected ResponseEntity<Object> handleDateParseException(
      DateTimeParseException ex, WebRequest request) {
    log.warn("Date Time Parse Exception Caught: {}", ex.getMessage(), ex);
    return buildErrorResponse(
        HttpStatus.BAD_REQUEST, "Invalid date format. Expected ISO-8601 format.", request);
  }

  /** Helper method to build a consistent error response body. */
  private ResponseEntity<Object> buildErrorResponse(
      HttpStatus status, String message, WebRequest request) {

    return ResponseEntity.status(status)
        .body(
            new ApiErrorResponse(
                Instant.now(),
                status.value(),
                status.getReasonPhrase(),
                message,
                URI.create(ServletUriComponentsBuilder.fromCurrentRequest().toUriString())));
  }
}
