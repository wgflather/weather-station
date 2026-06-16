package com.flather.weatherstation.controller;

import static org.hamcrest.Matchers.hasSize;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.flather.weatherstation.domain.constant.DataQuality;
import com.flather.weatherstation.domain.entity.WeatherRecord;
import com.flather.weatherstation.security.SecurityConfig;
import com.flather.weatherstation.service.DatabaseRawViewService;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(DatabaseViewController.class)
@Import(SecurityConfig.class)
@TestPropertySource(properties = {"user.username=testuser", "user.password=testpass"})
class DatabaseViewControllerTest {

  @Autowired MockMvc mockMvc;

  @MockitoBean DatabaseRawViewService service;

  @Test
  void shouldReturnPagedRecords_withDefaults() throws Exception {
    WeatherRecord record =
        WeatherRecord.builder()
            .id(1L)
            .deviceId("device-1")
            .temperature(21.5)
            .pressure(1012.0)
            .measuredAt(Instant.parse("2026-06-16T10:00:00Z"))
            .build();

    given(
            service.getRecords(
                anyBoolean(), isNull(), any(Pageable.class), isNull(), isNull(), isNull()))
        .willReturn(new PageImpl<>(List.of(record)));

    mockMvc
        .perform(
            get("/api/admin/records")
                .with(user("testuser").roles("ADMIN"))
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content", hasSize(1)))
        .andExpect(jsonPath("$.content[0].deviceId").value("device-1"))
        .andExpect(jsonPath("$.content[0].temperature").value(21.5));

    verify(service)
        .getRecords(anyBoolean(), isNull(), any(Pageable.class), isNull(), isNull(), isNull());
  }

  @Test
  void shouldReturnFilteredRecords_byDataQuality() throws Exception {
    WeatherRecord record =
        WeatherRecord.builder()
            .id(2L)
            .deviceId("device-1")
            .temperature(22.0)
            .temperatureDataQuality(DataQuality.OK)
            .measuredAt(Instant.parse("2026-06-16T10:00:00Z"))
            .build();

    given(
            service.getRecords(
                anyBoolean(),
                eq(DataQuality.OK),
                any(Pageable.class),
                isNull(),
                isNull(),
                isNull()))
        .willReturn(new PageImpl<>(List.of(record)));

    mockMvc
        .perform(
            get("/api/admin/records")
                .with(user("testuser").roles("ADMIN"))
                .param("quality", "OK")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content[0].temperatureDataQuality").value("OK"));

    verify(service)
        .getRecords(
            anyBoolean(), eq(DataQuality.OK), any(Pageable.class), isNull(), isNull(), isNull());
  }

  @Test
  void shouldReturnFilteredRecords_byDateRange() throws Exception {
    LocalDate from = LocalDate.of(2026, 6, 1);
    LocalDate to = LocalDate.of(2026, 6, 16);

    given(
            service.getRecords(
                anyBoolean(), isNull(), any(Pageable.class), isNull(), eq(from), eq(to)))
        .willReturn(new PageImpl<>(List.of()));

    mockMvc
        .perform(
            get("/api/admin/records")
                .with(user("testuser").roles("ADMIN"))
                .param("startDate", "2026-06-01")
                .param("endDate", "2026-06-16")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.content").isArray())
        .andExpect(jsonPath("$.totalElements").value(0));
  }

  @Test
  void shouldReturnAvailableDates() throws Exception {
    List<String> dates = List.of("2026-06-14", "2026-06-15", "2026-06-16");

    given(service.getAvailableDates(eq(LocalDate.of(2026, 6, 14)), eq(LocalDate.of(2026, 6, 16))))
        .willReturn(dates);

    mockMvc
        .perform(
            get("/api/admin/available-dates")
                .with(user("testuser").roles("ADMIN"))
                .param("from", "2026-06-14")
                .param("to", "2026-06-16")
                .accept(MediaType.APPLICATION_JSON))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$", hasSize(3)))
        .andExpect(jsonPath("$[0]").value("2026-06-14"));

    verify(service).getAvailableDates(eq(LocalDate.of(2026, 6, 14)), eq(LocalDate.of(2026, 6, 16)));
  }

  @Test
  void shouldDeleteRecord_andReturn200_whenFound() throws Exception {
    given(service.deleteRecord(42L)).willReturn(true);

    mockMvc
        .perform(delete("/api/admin/records/42").with(user("testuser").roles("ADMIN")))
        .andExpect(status().isOk());

    verify(service).deleteRecord(42L);
  }

  @Test
  void shouldReturn404_whenRecordNotFound() throws Exception {
    given(service.deleteRecord(99L)).willReturn(false);

    mockMvc
        .perform(delete("/api/admin/records/99").with(user("testuser").roles("ADMIN")))
        .andExpect(status().isNotFound());

    verify(service).deleteRecord(99L);
  }

  @Test
  void shouldDenyAccess_whenUnauthenticated() throws Exception {
    mockMvc
        .perform(get("/api/admin/records").accept(MediaType.APPLICATION_JSON))
        .andExpect(status().is(org.hamcrest.Matchers.not(200)));
  }
}
