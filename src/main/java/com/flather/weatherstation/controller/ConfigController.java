package com.flather.weatherstation.controller;

import com.flather.weatherstation.domain.entity.StationConfiguration;
import com.flather.weatherstation.dto.configuration.StationConfigurationResponse;
import com.flather.weatherstation.dto.configuration.UpdateDataProviderRequest;
import com.flather.weatherstation.dto.configuration.UpdateHardwareRequest;
import com.flather.weatherstation.dto.configuration.UpdateLocationRequest;
import com.flather.weatherstation.dto.configuration.UpdateValidationRequest;
import com.flather.weatherstation.service.StationConfigurationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/admin")
public class ConfigController {
  private final StationConfigurationService service;

  @GetMapping("/config")
  public ResponseEntity<StationConfigurationResponse> getConfiguration() {
    return ResponseEntity.ok(service.getConfigurationView());
  }

  @PutMapping("/config/location")
  public ResponseEntity<StationConfiguration> updateLocationConfiguration(
      @Valid @RequestBody UpdateLocationRequest request) {
    return ResponseEntity.ok(service.updateLocation(request));
  }

  @PutMapping("/config/validation")
  public ResponseEntity<StationConfiguration> updateValidationConfiguration(
      @Valid @RequestBody UpdateValidationRequest request) {
    return ResponseEntity.ok(service.updateValidation(request));
  }

  @PutMapping("/config/hardware")
  public ResponseEntity<StationConfiguration> updateHardwareConfiguration(
      @Valid @RequestBody UpdateHardwareRequest request) {
    return ResponseEntity.ok(service.updateHardware(request));
  }

  @PutMapping("/config/providers")
  public ResponseEntity<StationConfiguration> updateDataProviderConfiguration(
      @Valid @RequestBody UpdateDataProviderRequest request) {
    return ResponseEntity.ok(service.updateDataProviders(request));
  }
}
