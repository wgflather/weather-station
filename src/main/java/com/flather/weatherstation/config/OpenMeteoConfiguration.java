package com.flather.weatherstation.config;

import java.net.http.HttpClient;
import java.time.Duration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Configuration
public class OpenMeteoConfiguration {

  // Open-Meteo is called on the request thread, so a host that stops answering — rather than
  // refusing — would otherwise hold the dashboard request open for as long as the default allows.
  private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
  private static final Duration READ_TIMEOUT = Duration.ofSeconds(10);

  @Bean
  RestClient openMeteoClient(RestClient.Builder builder) {
    HttpClient httpClient = HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build();
    JdkClientHttpRequestFactory requestFactory = new JdkClientHttpRequestFactory(httpClient);
    requestFactory.setReadTimeout(READ_TIMEOUT);
    return builder.baseUrl("https://api.open-meteo.com/v1").requestFactory(requestFactory).build();
  }
}
