# Weather Station

A personal weather station dashboard built with Spring Boot. It ingests sensor readings from a local IoT device over MQTT, optionally fills in or replaces individual metrics with data from the Open-Meteo API, stores everything in PostgreSQL, and serves a real-time web dashboard with historical charts, astronomical calculations, and a basic seeing-quality forecast for telescope planning.

It's built for a **single station at a fixed location** — see [Limitations](#limitations) before assuming it fits a multi-site or multi-user use case.

## Features

- **Live dashboard** — current temperature, pressure, humidity, dew point, wind speed/direction, UV index, and surface wetness, polled every 30 seconds
- **Hybrid data sources** — each metric (temperature, pressure, humidity, wind, UV) can independently be sourced from the local sensor or from Open-Meteo, configured per-metric in the admin panel
- **Weather forecast strip** — cloud cover, precipitation, and weather-condition icons for the next several hours (via Open-Meteo)
- **Sun & moon modals** — an interactive whole-day sun altitude chart with a twilight gradient, dawn/dusk transition ladder, moon phase with a photorealistic rendered disc, and a moon-cycle position track
- **Historical charts** — daily and hourly aggregated charts for all tracked metrics, with a date-picker history modal
- **Data quality validation** — spike and anomaly detection using median-based statistics on incoming sensor data
- **Automatic rollup & retention** — raw readings are aggregated into hourly/daily summaries and pruned after 30 days
- **Admin panel** — configure station location, sensor thresholds, hardware labels, and per-metric data provider (login-protected)

## How It Works

```
MQTT broker → MqttConsumer → WeatherService → PostgreSQL ──┐
                                                             ├→ REST API → Dashboard (30s poll)
Open-Meteo API → WeatherClientService (20min cache) ───────┘
```

- **Ingestion**: `MqttConsumer` subscribes to the configured MQTT topic; each incoming payload is validated by `DataQualityValidator` (median-based spike/anomaly detection against a rolling in-memory window) and persisted as a `WeatherRecord`.
- **Dashboard data**: `DashboardService` assembles each metric per its configured provider — `LOCAL_SENSOR` reads the latest validated `WeatherRecord`; `EXTERNAL_API` calls `WeatherClientService`, which fetches Open-Meteo's `current` + `hourly` forecast (cached 20 minutes) and maps it into the same DTO shape as the sensor path, so the frontend renders either source identically.
- **Astronomy**: `AstronomyEngine` wraps the cosinekitty astronomy library to compute sun/moon altitude curves, rise/set/twilight times, and moon phase from the station's configured latitude/longitude/timezone — this is a deterministic calculation, not fetched from any external service, and is cached per calendar day.
- **Retention**: a nightly job (02:00, station-local time) rolls raw records into `hourly_weather_record`/`daily_weather_record` aggregates, then deletes raw records older than 30 days. A secondary safety-net job runs a few minutes past midnight in case the main rollup was skipped.
- **Configuration**: station coordinates, per-metric data provider, and validation thresholds are held in an in-memory `ConfigurationCache`, populated at startup and refreshed live (no restart) whenever the admin panel saves changes.

## Sensor Payload Contract

Firmware publishes one JSON object per reading to the configured MQTT topic. The same shape is accepted by `POST /api/weather`.

```json
{
  "deviceId": "station-1",
  "temperature": 21.5,
  "pressure": 1013.2,
  "humidity": 55.0,
  "surfaceWetness": 12.0,
  "wind": 3.4,
  "wind_direction": 210.0,
  "uv_index": 2.1,
  "WIFI_RSSI": -58.0
}
```

| Field | Unit | Required |
|---|---|---|
| `deviceId` | — | yes |
| `WIFI_RSSI` | dBm | no |
| `temperature` | °C | no |
| `pressure` | hPa | no |
| `humidity` | % | no |
| `surfaceWetness` | % | no |
| `wind` | m/s | no |
| `wind_direction` | ° (0–360) | no |
| `uv_index` | UV index | no |

`deviceId` is the only mandatory field. `WIFI_RSSI` is a link-quality diagnostic rather than a weather measurement — it is stored with the reading but not currently surfaced anywhere in the UI, and a station on Ethernet or behind a serial gateway can simply omit it.

Field naming is inconsistent for historical reasons — most metrics are camelCase, but `wind_direction`, `uv_index` and `WIFI_RSSI` are not. Send them exactly as spelled above.

### The three states a metric can be in

Each metric field carries one of three meanings, and the distinction matters — it is what separates *broken hardware* from *hardware you never fitted*:

| Send | Means | Recorded as |
|---|---|---|
| a number | the sensor took a reading | validated (see below) |
| `null` | the sensor is fitted but failed to read | `MISSING` |
| omit the field entirely | the station has no such sensor | `NOT_CONFIGURED` |

Omitting a field is the supported way to run a partial station. A station with only a thermometer sends `deviceId` and `temperature`, and the remaining six metrics report as `NOT_CONFIGURED` rather than appearing broken. **Do not send `null` for a sensor you do not have** — that reads as a fitted sensor failing on every single reading.

A field's state may vary between readings; nothing is cached from a previous message.

### How a numeric reading is graded

A value that arrives as a number is passed to `DataQualityValidator` and comes out as one of:

| Quality | Meaning |
|---|---|
| `OK` | within range, and not a spike against the recent median |
| `ANOMALY` | outside the configured min/max for that metric |
| `SPIKE` | plausible on its own, but too far from the median of recent readings |
| `MISSING` | `NaN` or infinite |

Ranges and spike limits are per-station and editable in the admin panel; `wind_direction` is fixed at 0–360. Note that firmware using *numeric* sentinels for a failed read — `-999`, `65535` — will be graded `ANOMALY`, not `MISSING`, since those are valid numbers outside the plausible range. Prefer `null`.

### Values outside the contract

The parser is deliberately lenient, because MQTT ingest is a trust boundary: a deserialization failure aborts the whole message, so one malformed field would discard every other metric in that reading.

Anything that is not a number degrades **that field alone** to `MISSING`; the rest of the reading is stored normally. These spellings are accepted quietly, as sensor libraries commonly emit them:

- `""` or a blank string
- `"NaN"`, `"Infinity"`, `"-Infinity"`
- a quoted number, e.g. `"21.5"`

Anything else — `"n/a"`, `"--"`, lowercase `"nan"`, a comma decimal separator like `"21,5"`, a boolean, an object, an array — is also recorded as `MISSING`, but logs a `[PAYLOAD_UNPARSEABLE]` warning naming the field and the offending value. Those warnings mean the firmware is off-contract and should be fixed; do not rely on the safety net.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Spring Boot 4.0.5 / Java 25 |
| Database | PostgreSQL + Flyway migrations |
| ORM | Spring Data JPA / Hibernate |
| Messaging | Eclipse Paho MQTT client |
| External API | Open-Meteo (free, no API key required) |
| Astronomy | cosinekitty astronomy library |
| Frontend | Thymeleaf + vanilla JS (ES modules), Chart.js |
| Security | Spring Security (form login + HTTP Basic, single admin user) |
| Code gen | Lombok, MapStruct |
| Caching | Caffeine (in-memory) |

## Getting Started

### Prerequisites

- Java 25
- PostgreSQL on `localhost:5432` with a database named `weather_station`
- An MQTT broker (e.g. Mosquitto) — optional if you only use the external API for every metric

### Run

```bash
./mvnw spring-boot:run
```

The app starts on `http://localhost:8080` with the `local` profile active. Database credentials and MQTT settings live in `src/main/resources/application-local.yml` (gitignored — not checked in; create your own from `application.yml`'s structure).

### Build & Test

```bash
./mvnw clean package                         # full build with tests
./mvnw clean package -Dmaven.test.skip=true  # build without tests
./mvnw test                                  # run the test suite
```

## Running with Docker

Two deployment modes share one image. Pick by what your machine already runs.

| Mode | Files | Use when |
|---|---|---|
| **Full stack** | `docker-compose.yml` + `docker-compose.full.yml` | Nothing set up yet — brings its own PostgreSQL and Mosquitto |
| **App only** | `docker-compose.yml` | You already run PostgreSQL and an MQTT broker (e.g. alongside Home Assistant) |

Images are published to `ghcr.io/wgflather/weather-station` for `linux/amd64` and `linux/arm64`, so the same tag runs on a Raspberry Pi and on a normal x86 box.

### Mode 1 — Full stack

Everything included; nothing to install but Docker.

```bash
cp .env.example .env      # then edit POSTGRES_PASSWORD and ADMIN_PASSWORD
docker compose -f docker-compose.yml -f docker-compose.full.yml up -d
```

`.env` must set `POSTGRES_PASSWORD` and `ADMIN_PASSWORD`. Compose refuses to start
without them rather than falling back to a default — a station reachable with a
guessable admin password is worse than one that did not start.

The app waits for PostgreSQL to report healthy before booting, because Flyway runs
its migrations during startup and must not race the database.

### Mode 2 — App only

Bring your own PostgreSQL and broker. Connection details come from a config file
you mount in — they are never baked into the image:

```
weather-station/
├── docker-compose.yml
└── config/
    └── application-local.yml
```

```bash
docker compose pull && docker compose up -d
```

Use `src/main/resources/application-local.yml` as the template — same file, same
shape. **The filename matters**: the container loads `/app/config/` as a config
directory, so only `application.yml` and `application-<active-profile>.yml` are
read. The active profile is `local` by default, so `application-local.yml` is
picked up and `application-pi.yml` would be silently ignored.

This mode deliberately injects no `SPRING_DATASOURCE_*` or `MQTT_*` environment
variables. Spring Boot ranks environment variables **above** external config
files, so setting them here would silently override the file you just mounted.

> **One caveat if you keep this inside a source checkout.** `./config/` is also
> one of Spring Boot's *default* config locations, and `file:` locations outrank
> `classpath:` ones. So a `config/application-local.yml` holding container
> hostnames (`postgres`, `mosquitto`) would also be picked up by
> `./mvnw spring-boot:run`, shadowing `src/main/resources/application-local.yml`
> and failing with `UnknownHostException: postgres`. The test suite is immune —
> it runs under the `test` profile and never loads `application-local.yml` at
> all — but a local run is not. Keeping the deployment in its own directory
> avoids the question entirely.

### Building the image locally

Published images come from CI, but you can build the same thing yourself:

```bash
docker build -t ghcr.io/wgflather/weather-station:latest .
```

Tagging it with the full name means compose uses your local build instead of
pulling. The build cross-compiles rather than emulating: the Maven stage is
pinned to the builder's own architecture, which is safe because a jar is
architecture-neutral, and only the JRE layer varies per target.

### Verifying it works

```bash
docker compose ps                                   # all services healthy?
curl http://localhost:8080/actuator/health          # {"status":"UP"}
curl -I http://localhost:8080/                      # 302 -> /weather (expected)
docker compose logs -f weather-station              # follow startup
```

End-to-end check — publish a reading and confirm it lands (full-stack mode):

```bash
docker exec weather-mosquitto mosquitto_pub -h localhost -t weather/station -m '{"deviceId":"smoke-test","temperature":21.5,"pressure":1013.2,"humidity":55.0,"WIFI_RSSI":-58.0}'

curl http://localhost:8080/api/weather/dashboard/live
```

The dashboard should show the value within a poll cycle. Metrics you omit report
`NOT_CONFIGURED`, not `MISSING` — see the payload contract above.

### Updating

```bash
docker compose pull && docker compose up -d
```

Only the changed layers download. Data survives in named volumes; `down -v`
destroys them, plain `down` does not.

### Troubleshooting

**`localhost` in the config file resolves to the container, not your machine.**
The most common app-only failure: a datasource URL of
`jdbc:postgresql://localhost:5432/...` makes the app look for PostgreSQL *inside
its own container*. Use the host's LAN IP, or `host.docker.internal` — which needs
an extra line on Linux:

```yaml
services:
  weather-station:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

**Port already in use.** Set `APP_PORT` (and `MQTT_HOST_PORT` in full-stack mode)
in `.env`; both are host-side only and change nothing inside the container.

**App exits with `Could not resolve placeholder 'user.username'`.** It found no
config: the `config/` directory is missing, empty, or the file is named for a
profile that is not active. Docker silently creates an empty directory if it does
not exist, so a typo in the path looks identical to a missing file.

**Config file unreadable.** The container runs as root by default, so host file
permissions are not normally an issue. If you override with `user:` in compose,
the bind-mounted file's numeric owner must match that UID — bind mounts pass UIDs
straight through without translation.

**Build fails with `failed to untar`.** The Maven wrapper downloads Maven as a
`.tar.gz` and shells out to `tar`; the build stage installs `tar` and `gzip`
because the Corretto base image ships neither.

## Configuration

Station settings (location, data providers, validation thresholds, hardware labels) are managed at runtime through the admin panel at `/admin/config.html`, protected by a single configured user (`user.username` / `user.password`). Changes take effect immediately, no restart required.

Station coordinates (latitude, longitude, timezone) drive both the Open-Meteo API queries and every astronomical calculation — get them right, since they're the single source of truth for both.

## Limitations

- **Single station, single tenant.** `ConfigurationCache` holds one location/hardware/provider configuration for the whole app; there's no concept of multiple stations or accounts.
- **Single admin user.** No user management, no OAuth/SSO — one username/password pair configured via properties, with both form login and HTTP Basic enabled. CSRF protection is disabled, a reasonable trade-off for a single-user personal deployment but not something to carry over to a multi-user setup.
- **API-backed metrics update hourly, not live.** Open-Meteo's `current`/`hourly` data is fetched at most once per 20-minute cache window and is itself hourly-resolution upstream — switching a metric to `EXTERNAL_API` trades sensor-grade freshness for coverage when hardware is unavailable.
- **No MQTT delivery guarantees.** Readings that arrive while the broker or database is unreachable are simply lost — there's no offline queue or replay.
- **Raw data retention is 30 days.** Older readings only survive as hourly/daily aggregates; per-reading granularity beyond a month is gone.
- **Astronomy cache refreshes on calendar-day/timezone boundaries.** Sun/moon daily events are cached up to 48 hours; mid-day station relocations won't reflect until the next natural cache eviction.
- **Seeing quality is a model estimate**, not a measurement — it's derived from forecast jet-stream and surface wind speed via a Hufnagel-Valley approximation, useful as a planning signal but not a substitute for actual seeing monitors.
- **No built-in TLS.** The app expects a reverse proxy in front of it for HTTPS in any real deployment; it serves plain HTTP on its own.
- **Test coverage is partial.** Controllers, several services, and a Spring context smoke test exist, but there's no end-to-end or frontend test suite.

## Project Structure

```
src/main/
├── java/com/flather/weatherstation/
│   ├── WeatherStationApplication.java
│   ├── cache/
│   │   ├── ConfigurationCache.java
│   │   ├── ConfigurationInitializer.java
│   │   ├── SensorCacheInitializer.java
│   │   └── SensorStateCache.java
│   ├── client/
│   │   └── OpenMeteoProvider.java
│   ├── config/
│   │   ├── CacheConfig.java
│   │   ├── ConfigurationEventListener.java
│   │   ├── DataProviderConfiguration.java
│   │   ├── HardwareConfig.java
│   │   ├── LocationContext.java
│   │   ├── MqttProperties.java
│   │   ├── OpenMeteoConfiguration.java
│   │   └── WeatherValidationConfig.java
│   ├── controller/
│   │   ├── AstronomyController.java
│   │   ├── ConfigController.java
│   │   ├── DatabaseViewController.java
│   │   ├── GlobalExceptionHandler.java
│   │   ├── LoginController.java
│   │   ├── WeatherController.java
│   │   ├── WeatherDashboardController.java
│   │   ├── WeatherForecastController.java
│   │   └── WeatherHistoryController.java
│   ├── converter/
│   │   └── MetricConverter.java
│   ├── domain/
│   │   ├── constant/
│   │   │   ├── BeaufortScale.java
│   │   │   ├── DailyCurveResolution.java
│   │   │   ├── DataProvider.java
│   │   │   ├── DataQuality.java
│   │   │   ├── DataStatus.java
│   │   │   ├── DewPointRisk.java
│   │   │   ├── Metric.java
│   │   │   ├── PressureTrend.java
│   │   │   ├── SurfaceWetnessStatus.java
│   │   │   ├── TrendDirection.java
│   │   │   ├── UvLevel.java
│   │   │   └── WindDirectionLabel.java
│   │   ├── entity/
│   │   │   ├── DailyWeatherRecord.java
│   │   │   ├── HourlyWeatherRecord.java
│   │   │   ├── StationConfiguration.java
│   │   │   └── WeatherRecord.java
│   │   └── event/
│   │       └── ConfigurationUpdatedEvent.java
│   ├── dto/
│   │   ├── analytics/         # Metric DTOs (Temperature, Pressure, Humidity, Wind, UV, ...)
│   │   ├── astronomy/         # Sun/moon snapshots, curves, events
│   │   ├── configuration/     # Station config request/response DTOs
│   │   ├── dashboard/         # Dashboard and chart DTOs
│   │   ├── error/
│   │   ├── forecast/          # Weather & astro forecast DTOs
│   │   ├── projection/        # JPA projections
│   │   ├── validation/
│   │   └── weather/           # Raw record DTOs
│   ├── mapper/
│   │   ├── MetricDataDetailsMapper.java
│   │   ├── StationConfigurationMapper.java
│   │   ├── WeatherHistoryMapper.java
│   │   └── WeatherRecordMapper.java
│   ├── messaging/
│   │   └── MqttConsumer.java
│   ├── repository/
│   │   ├── DailyWeatherRecordRepository.java
│   │   ├── HourlyWeatherRecordRepository.java
│   │   ├── RawDatabaseViewRepository.java
│   │   ├── StationConfigurationRepository.java
│   │   ├── WeatherReportRepository.java
│   │   └── WeatherRetentionRepository.java
│   ├── security/
│   │   └── SecurityConfig.java
│   ├── service/
│   │   ├── AnalyticsService.java
│   │   ├── AstronomyEngine.java
│   │   ├── AstronomySearch.java
│   │   ├── DashboardService.java
│   │   ├── DataQualityValidator.java
│   │   ├── DatabaseRawViewService.java
│   │   ├── SeeingCalculator.java
│   │   ├── StationConfigurationService.java
│   │   ├── WeatherClientService.java
│   │   ├── WeatherHistoryService.java
│   │   ├── WeatherRetentionService.java
│   │   └── WeatherService.java
│   └── util/
│       ├── DateRangeHelper.java
│       ├── FormatUtil.java
│       ├── MeteoMath.java
│       └── TimeUtil.java
└── resources/
    ├── application.yml
    ├── application-local.yml   # gitignored, not checked in
    ├── logback.xml
    ├── db/migration/
    │   ├── V1__create-weather-record-table.sql
    │   ├── V2__create-station-configuration-properties-table.sql
    │   ├── V3__alter_surface_wetness_to_double.sql
    │   ├── V4__add_wifi_rssi_column.sql
    │   ├── V5__create_hourly_and_daily_weather_tables.sql
    │   ├── V6__add_data_provider_configuration_columns.sql
    │   ├── V7__add_wind_uv_index_to_weather_records.sql
    │   └── V8__add_wind_direction_to_weather_records.sql
    ├── static/
    │   ├── admin/config.html
    │   ├── history.html
    │   ├── css/
    │   │   ├── style.css
    │   │   └── pages.css
    │   └── js/
    │       ├── fetch-data.js            # orchestrator: live polling, sky background, modals
    │       ├── sun-modal-chart.js       # sun modal SVG altitude chart
    │       ├── sky-colors.js            # shared sun-altitude → sky color model
    │       ├── moon-canvas.js           # photorealistic moon disc renderer
    │       ├── star-field.js            # background star field
    │       ├── cloud-forecast.js        # hourly forecast strip
    │       ├── weather-chart.js         # 24h metric chart (Chart.js)
    │       ├── daily-chart.js           # history daily chart
    │       ├── FetchScheduler.js        # incremental chart data fetcher
    │       ├── history.js / history-modal.js / history-summary.js
    │       ├── config.js                # admin panel
    │       ├── database-view.js         # admin raw-data view
    │       ├── equalize-card-height.js
    │       └── realtime-script.js       # clock (plain script, not a module)
    └── templates/
        ├── index.html          # Main dashboard
        └── login.html
```
