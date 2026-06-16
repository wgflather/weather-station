package com.flather.weatherstation.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

@Configuration
public class OpenMeteoConfiguration {
  @Bean
  RestClient openMeteoClient(RestClient.Builder builder) {
    return builder.baseUrl("https://api.open-meteo.com/v1").build();
  }
}
