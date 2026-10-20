package com.flather.weatherstation.controller;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.flather.weatherstation.config.HardwareConfig;
import com.flather.weatherstation.config.LocationContext;
import com.flather.weatherstation.config.WeatherValidationConfig;
import com.flather.weatherstation.domain.entity.StationConfiguration;
import com.flather.weatherstation.dto.configuration.*;
import com.flather.weatherstation.security.SecurityConfig;
import com.flather.weatherstation.service.StationConfigurationService;
import java.time.ZoneId;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

@WebMvcTest(ConfigController.class)
@Import(SecurityConfig.class)
@TestPropertySource(properties = {"user.username=testuser", "user.password=testpass"})
class ConfigControllerTest {

  @Autowired MockMvc mockMvc;
  @Autowired ObjectMapper objectMapper;

  @MockitoBean StationConfigurationService service;

  @Test
  void shouldReturnConfiguration_whenAdmin() throws Exception {
    LocationContext location =
        new LocationContext(52.5, 13.4, 34.0, ZoneId.of("Europe/Berlin"), null);
    WeatherValidationConfig validation =
        new WeatherValidationConfig(
            -40, 60, 900, 1100, 0, 100, 20, 5.0, 10.0, 800, 200, 0.0, 60.0, 20.0, 0.0, 16.0, 5.0);
    HardwareConfig hardware =
        new HardwareConfig("Raspberry Pi", "DS18B20", "DHT22", "BMP180", null, null, null);
    StationConfigurationResponse response =
        new StationConfigurationResponse(location, validation, hardware, null);

    given(service.getConfigurationView()).willReturn(response);

    mockMvc
        .perform(
            get("/api/admin/config")
                .with(user("testuser").roles("ADMIN"))
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.location.latitude").value(52.5))
        .andExpect(jsonPath("$.location.longitude").value(13.4))
        .andExpect(jsonPath("$.hardware.board").value("Raspberry Pi"));

    verify(service).getConfigurationView();
  }

  @Test
  void shouldDenyAccess_whenUnauthenticated() throws Exception {
    mockMvc
        .perform(get("/api/admin/config").accept(MediaType.APPLICATION_JSON))
        .andExpect(status().is(org.hamcrest.Matchers.not(200)));
  }

  @Test
  void shouldUpdateLocation_whenRequestIsValid() throws Exception {
    UpdateLocationRequest request = new UpdateLocationRequest(13.4, 52.5, 34.0);
    StationConfiguration config = new StationConfiguration();
    config.setLongitude(13.4);
    config.setLatitude(52.5);
    config.setElevation(34.0);

    given(service.updateLocation(any())).willReturn(config);

    mockMvc
        .perform(
            put("/api/admin/config/location")
                .with(user("testuser").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.longitude").value(13.4))
        .andExpect(jsonPath("$.latitude").value(52.5));

    verify(service).updateLocation(any());
  }

  @Test
  void shouldReturn400_whenLocationMissingLatitude() throws Exception {
    String body =
        """
            {"lon": 13.4}
            """;

    mockMvc
        .perform(
            put("/api/admin/config/location")
                .with(user("testuser").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
        .andExpect(status().isBadRequest());
  }

  @Test
  void shouldReturn400_whenLocationLongitudeOutOfRange() throws Exception {
    UpdateLocationRequest request = new UpdateLocationRequest(200.0, 52.5, null);

    mockMvc
        .perform(
            put("/api/admin/config/location")
                .with(user("testuser").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
        .andExpect(status().isBadRequest());
  }

  @Test
  void shouldUpdateValidation_whenRequestIsValid() throws Exception {
    UpdateValidationRequest request =
        new UpdateValidationRequest(
            -40.0, 60.0, 900.0, 1100.0, 0.0, 100.0, 20.0, 5.0, 10.0, 800, 200, 0.0, 60.0, 20.0, 0.0,
            16.0, 5.0);
    StationConfiguration config = new StationConfiguration();
    config.setTempMinimal(-40.0);
    config.setTempMaximum(60.0);

    given(service.updateValidation(any())).willReturn(config);

    mockMvc
        .perform(
            put("/api/admin/config/validation")
                .with(user("testuser").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.tempMinimal").value(-40.0));

    verify(service).updateValidation(any());
  }

  @Test
  void shouldReturn400_whenValidationMissingRequiredField() throws Exception {
    String body =
        """
            {"tempMinimal": -40.0, "tempMaximum": 60.0}
            """;

    mockMvc
        .perform(
            put("/api/admin/config/validation")
                .with(user("testuser").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
        .andExpect(status().isBadRequest());
  }

  @Test
  void shouldUpdateHardware_whenRequestIsValid() throws Exception {
    UpdateHardwareRequest request =
        new UpdateHardwareRequest("Raspberry Pi", "DS18B20", "DHT22", "BMP180", null, null, null);
    StationConfiguration config = new StationConfiguration();
    config.setBoard("Raspberry Pi");

    given(service.updateHardware(any())).willReturn(config);

    mockMvc
        .perform(
            put("/api/admin/config/hardware")
                .with(user("testuser").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.board").value("Raspberry Pi"));

    verify(service).updateHardware(any());
  }

  @Test
  void shouldReturn400_whenHardwareMissingBoard() throws Exception {
    String body =
        """
            {"temperatureSensor": "DS18B20"}
            """;

    mockMvc
        .perform(
            put("/api/admin/config/hardware")
                .with(user("testuser").roles("ADMIN"))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body))
        .andExpect(status().isBadRequest());
  }
}
