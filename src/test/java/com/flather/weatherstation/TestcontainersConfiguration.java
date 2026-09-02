package com.flather.weatherstation;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Provides a real PostgreSQL for the full-context test.
 *
 * <p>Without this, {@code @SpringBootTest} has no datasource, and because H2 used to sit on the
 * runtime classpath Spring Boot would quietly auto-configure an embedded H2 instead of failing.
 * Flyway then ran the Postgres migrations against it and died on {@code TIMESTAMPTZ} in V1 — three
 * layers downstream of the actual problem. The container makes the test hermetic: it no longer
 * depends on a developer's local database, and it exercises the migrations against the engine they
 * were written for.
 *
 * <p>{@code @ServiceConnection} supplies the JDBC url/credentials as connection details, which take
 * precedence over any {@code spring.datasource.*} properties, so no test-side URL wiring is needed.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

  @Bean
  @ServiceConnection
  PostgreSQLContainer postgresContainer() {
    return new PostgreSQLContainer("postgres:17-alpine");
  }
}
