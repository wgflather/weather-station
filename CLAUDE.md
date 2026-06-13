# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
./mvnw clean package            # Full build with tests
./mvnw clean package -Dmaven.test.skip=true  # Build without tests
./mvnw spring-boot:run          # Run locally (requires PostgreSQL + MQTT broker)
./mvnw test                     # Run all tests
./mvnw test -Dtest=ClassName    # Run a single test class
./mvnw spotless:apply           # Format code (Google Java Format — run before committing)
```

## Architecture Overview

Spring Boot 4.0.5 / Java 25 application that ingests weather sensor data via MQTT, stores it in PostgreSQL, performs data quality analysis, and serves a Thymeleaf web dashboard with real-time analytics and astronomical calculations.

### Data Flow

MQTT broker → `MqttConsumer` → `WeatherService` → PostgreSQL → REST API / Thymeleaf views

### Key Layers

**Messaging** (`messaging/`): `MqttConsumer` subscribes to `weather/bmp180`, handles reconnection with exponential backoff (max 5 attempts).

**Service** (`service/`): Core business logic.
- `WeatherService` — persists records, triggers validation
- `DataQualityValidator` — detects anomalies/spikes using median-based statistical methods; reads from `SensorStateCache`
- `AnalyticsService` / `DashboardService` — time-series aggregation for charts and dashboard
- `AstronomySearch` + `AstroUtil` — sunrise/sunset, moon phase calculations (cosinekitty astronomy lib)
- `MeteoMath` — dew point, pressure trend, surface wetness status

**Cache** (`cache/`): In-memory caches initialized at startup. `ConfigurationCache` holds station config; `SensorStateCache` holds recent readings for spike detection. Both populated by `*Initializer` beans.

**Controller** (`controller/`): REST + MVC.
- `WeatherController` — `/api/weather/*` endpoints (latest, create, dashboard, chart)
- `WeatherDashboardController` — serves the Thymeleaf dashboard
- `ConfigController` — station configuration CRUD
- `DatabaseViewController` — admin raw data view

**Domain** (`domain/`): JPA entities (`WeatherRecord`, `StationConfiguration`) and enums (`DataQuality`, `Metric`, `DataStatus`, `PressureTrend`, `DewPointRisk`, `SurfaceWetnessStatus`, `TrendDirection`).

**DTOs + Mappers** (`dto/`, `mapper/`): MapStruct mappers handle all entity↔DTO conversion. Never map manually.

**Config** (`config/`): Properties classes bound via `@ConfigurationProperties` — `MqttProperties`, `LocationContext` (lat/lon/timezone), `WeatherValidationConfig` (spike/anomaly thresholds), `HardwareConfig`.

### Database

PostgreSQL with Flyway migrations (`src/main/resources/db/migration/`). JPA is set to `validate` — schema changes require a new migration file. Two tables: `weather_record` and `station_configuration_properties`.

Local DB: `localhost:5432/weather_station` (configured in `application-local.yml`). Active profile: `local`.

### Code Style

Google Java Format is enforced by the Spotless Maven plugin. Always run `./mvnw spotless:apply` before committing. Lombok is used for boilerplate reduction; MapStruct for all mapper generation (annotation processor runs at compile time).
