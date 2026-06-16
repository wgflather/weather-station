package com.flather.weatherstation.controller;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(WeatherDashboardController.class)
class WeatherDashboardControllerTest {

  @Autowired MockMvc mockMvc;

  @Test
  void shouldReturnIndexView() throws Exception {
    mockMvc
        .perform(get(WeatherDashboardController.BASE_PATH))
        .andExpect(status().isOk())
        .andExpect(view().name("index"));
  }
}
