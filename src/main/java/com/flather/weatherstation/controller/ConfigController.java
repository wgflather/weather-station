package com.flather.weatherstation.controller;

import com.flather.weatherstation.domain.entity.StationConfiguration;
import com.flather.weatherstation.dto.configuration.UpdateLocationRequest;
import com.flather.weatherstation.service.StationConfigurationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequiredArgsConstructor
@RequestMapping("api/admin")
public class ConfigController {
  private final StationConfigurationService service;

  @PutMapping("/config/location")
  public ResponseEntity<StationConfiguration> updateLocationConfiguration(
      @Valid @RequestBody UpdateLocationRequest request) {
    return ResponseEntity.ok(service.updateLocation(request));
  }
}
