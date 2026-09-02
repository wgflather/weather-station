package com.flather.weatherstation;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * Boots the whole application context.
 *
 * <p>{@code @ActiveProfiles("test")} is what stops this from loading the developer's own {@code
 * application-local.yml}: it supplies the {@code user.*} credentials SecurityConfig requires and
 * disables the MQTT consumer, so the test needs neither a local database nor a broker.
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class WeatherStationApplicationTests {

  @Test
  void contextLoads() {}
}
