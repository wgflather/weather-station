# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
./mvnw clean package                         # Full build with tests
./mvnw clean package -Dmaven.test.skip=true  # Build without tests
./mvnw spring-boot:run                       # Run locally (requires PostgreSQL + MQTT broker)
./mvnw test                                  # Run all tests
./mvnw test -Dtest=ClassName                 # Run a single test class
./mvnw spotless:apply                        # Format code (Google Java Format — run before committing)
```

## Architecture Overview

Spring Boot 4.0.5 / Java 25 application that ingests weather sensor data via MQTT, stores it in PostgreSQL, performs data quality analysis, and serves a Thymeleaf web dashboard with real-time analytics, astronomical calculations, and Open-Meteo weather forecasts.

### Data Flow

MQTT broker → `MqttConsumer` → `WeatherService` → PostgreSQL → REST API / Thymeleaf views

---

## Backend

### Controllers (`controller/`)

| Controller | Base path | Purpose |
|---|---|---|
| `WeatherController` | `/api/weather` | Ingest (`POST`), live dashboard, 24-h chart |
| `WeatherDashboardController` | `/` | Serves the Thymeleaf dashboard (`index.html`) |
| `WeatherForecastController` | `/api/forecast` | Cloud strip (`/clouds`) and astro forecast (`/astro`) |
| `AstronomyController` | `/api/astronomy` | Daily sun/moon events (`/daily`), altitude curve (`/curve`) |
| `WeatherHistoryController` | `/api/weather/history` | Available dates, hourly/daily records, chart data |
| `ConfigController` | `/api/admin/config` | Station configuration CRUD (`GET`, `PUT` location/validation/hardware) |
| `DatabaseViewController` | `/api/admin/db` | Raw database view for admin |
| `LoginController` | `/login` | Login page |
| `GlobalExceptionHandler` | — | Unified error responses (`ApiErrorResponse`) |

### Services (`service/`)

- **`WeatherService`** — persists `WeatherRecord`, triggers validation via `DataQualityValidator`.
- **`DataQualityValidator`** — detects spikes and anomalies using median-based statistical methods; reads recent readings from `SensorStateCache`.
- **`AnalyticsService`** — time-series aggregation for 24-h charts (buckets of configurable resolution).
- **`DashboardService`** — assembles the live dashboard DTO (metrics, system health, snapshots).
- **`AstronomyEngine`** — wraps the cosinekitty astronomy lib; computes sun/moon altitude curves, rise/set/twilight times, moon phase.
- **`AstronomySearch`** — binary-search horizon crossing finder used by `AstronomyEngine`.
- **`WeatherClientService`** — calls `OpenMeteoProvider` and maps the response to `WeatherConditionPoint` and `AstroForecastPoint` lists.
- **`SeeingCalculator`** — Hufnagel-Valley HV 5/7 atmospheric turbulence model; inputs are jet-stream speed (200 hPa) and surface wind speed; outputs FWHM seeing in arc-seconds (Excellent / Good / Fair / Poor / Very Poor).
- **`WeatherHistoryService`** — queries `HourlyWeatherRecord` and `DailyWeatherRecord` for history modal charts.
- **`WeatherRetentionService`** — scheduled cleanup of old raw records.
- **`StationConfigurationService`** — CRUD for `StationConfiguration`; publishes `ConfigurationUpdatedEvent` on save.
- **`DatabaseRawViewService`** — paged raw record queries for the admin view.
- **`MeteoMath`** (util) — dew point, pressure trend classification, surface wetness status.

### External API (`client/`)

**`OpenMeteoProvider`** calls `https://api.open-meteo.com/v1/forecast` with:

```
hourly: weather_code, cloud_cover, cloud_cover_low, cloud_cover_mid, cloud_cover_high,
        precipitation_probability, rain, showers, snowfall,
        wind_speed_10m, wind_speed_200hPa
forecast_days: 2
```

Cached by `CacheConfig` (Caffeine):
- `apiWeather` — 20-minute TTL, max 1 entry, key is `lat_lon` (5 decimal places).
- Spring's default astronomy cache — 48-hour TTL, max 4 entries (one per day per zone).

### Cache (`cache/`)

- **`ConfigurationCache`** — singleton holding station lat/lon/timezone/thresholds; populated by `ConfigurationInitializer` at startup; invalidated on `ConfigurationUpdatedEvent`.
- **`SensorStateCache`** — ring buffer of recent sensor readings for spike detection; populated by `SensorCacheInitializer`.

### Domain (`domain/`)

**Entities:** `WeatherRecord`, `StationConfiguration`, `HourlyWeatherRecord`, `DailyWeatherRecord`.

**Enums:** `DataQuality`, `DataStatus`, `Metric`, `PressureTrend`, `DewPointRisk`, `SurfaceWetnessStatus`, `TrendDirection`, `CelestialBody`, `SolarCondition`, `DailyCurveResolution`.

### Database

PostgreSQL with Flyway migrations (`src/main/resources/db/migration/`). JPA is set to `validate` — schema changes require a new migration file.

| Migration | Description |
|---|---|
| V1 | `weather_record` table |
| V2 | `station_configuration_properties` table |
| V3 | Alter surface wetness column to `DOUBLE` |
| V4 | Add `wifi_rssi` column |
| V5 | `hourly_weather_record` and `daily_weather_record` tables |

Local DB: `localhost:5432/weather_station` (`application-local.yml`). Active profile: `local`.

### DTOs & Mappers

MapStruct mappers in `mapper/` handle all entity↔DTO conversion — never map manually. Key DTO packages:
- `dto/analytics/` — temperature, pressure, humidity, wetness, trend result
- `dto/astronomy/` — daily events, sun/moon snapshots, twilight times, curve points
- `dto/dashboard/` — live dashboard, chart, system health
- `dto/forecast/` — `WeatherConditionPoint`, `AstroForecastPoint`, `ForecastDto`, `AstroForecastDto`
- `dto/weather/` — weather record create/response
- `dto/projection/` — `DataPoint`, `ExtremesProjection`, `DailySummaryProjection`

### Config (`config/`)

`@ConfigurationProperties` classes: `MqttProperties`, `LocationContext` (lat/lon/timezone), `WeatherValidationConfig` (spike/anomaly thresholds), `HardwareConfig`. `OpenMeteoConfiguration` builds the `RestClient` bean. `CacheConfig` registers Caffeine caches. `SecurityConfig` configures form login.

### Code Style

Google Java Format enforced by Spotless. Always run `./mvnw spotless:apply` before committing. Lombok reduces boilerplate; MapStruct generates mappers at compile time.

---

## Frontend

### Page structure

| Template / file | URL | Purpose |
|---|---|---|
| `templates/index.html` | `/` | Main dashboard (Thymeleaf) |
| `static/history.html` | `/history.html` | History page (static, unused directly — history opened via modal) |
| `static/admin/config.html` | `/admin/config.html` | Station configuration admin panel |

### JavaScript modules (all under `static/js/`)

Every script loaded from `index.html` is a `type="module"` except `realtime-script.js` (plain script, runs synchronously before modules).

| File | Type | Role |
|---|---|---|
| `realtime-script.js` | plain script | Clock, date/time DOM updates (runs every second) |
| `fetch-data.js` | ES module (orchestrator) | All live data polling (30 s), sky background, astro cards, metric cards, status, modals, chart controls |
| `star-field.js` | ES module | Atmospheric star field canvas + CSS-animated highlights |
| `cloud-forecast.js` | ES module | Hourly cloud/weather forecast strip; icon selection; tooltip |
| `sun-modal-chart.js` | ES module | Sun modal SVG chart: whole-day altitude curve with twilight gradient, label chips, scrubbing |
| `weather-chart.js` | ES module | Chart.js 24-h metric chart |
| `FetchScheduler.js` | ES module | Incremental chart data fetcher (fetches only new buckets) |
| `history-modal.js` | ES module | History chart modal (date picker + period tabs) |
| `history-summary.js` | ES module | History summary stats rendering |
| `daily-chart.js` | ES module | Daily chart rendering (used in history) |

### Cross-module communication (window globals)

Modules that need to talk to each other use `window.*` since they load independently. Do not remove these without updating all callers.

| Global | Set by | Read by | Purpose |
|---|---|---|---|
| `window.refreshCloudSunTimes(riseIso, setIso)` | `cloud-forecast.js` | `fetch-data.js` (calls it after astronomy loads) | Re-renders strip with correct day/night icons |
| `window.getCurrentCloudCover()` | `cloud-forecast.js` | `star-field.js` | Cloud cover multiplier for star opacity |
| `window.setStarFieldModalDim(bool)` | `fetch-data.js` (re-exports from `star-field.js`) | `history-modal.js` | Dims stars while any modal is open |

### Sky background system (`fetch-data.js`)

The page background gradient is driven by the current sun altitude, updated on every 30-second poll:

- **`SKY_ANCHORS`** — 8-entry table mapping altitude (−18° to +50°) to top/bottom gradient RGB, card surface color, and sky-ambient glow color.
- **`computeSkyColors(altDeg)`** — linearly interpolates between bracketing anchors.
- **`applySkyColors(colors, snap)`** — writes to CSS custom properties on `:root`. The `snap` flag bypasses the 12 s CSS transition for instant switches.
- **`@property`** typed custom properties (`--bg-grad-top`, `--bg-grad-bottom`, `--card-bg`, etc.) enable CSS color interpolation between values.
- **Background preference** (dynamic / static preset) is persisted in `localStorage` as `bgPreference`. Static mode uses a fixed anchor; dynamic mode follows live sun altitude. `getStarAltitude()` reads the preference to supply the correct effective altitude to the star field.

### Star field (`star-field.js`)

- Canvas-based background stars (140 stars, soft radial-gradient bloom) + 11 DOM highlight stars with CSS `star-breathe` animations.
- Stars generated once with a seeded PRNG (`0xCAFEBABE`) — deterministic layout across every load.
- `altToStarOpacity(alt)` ramp: fade begins at −4° (first stars visible), reaches 0.22 at −12° (civil), 0.62 at −18° (nautical), 1.0 at −27° (astronomical night).
- Cloud cover from `window.getCurrentCloudCover()` acts as a multiplier (overcast reduces opacity by up to 85%).
- `z-index: -1` — sits above the sky gradient (`body::before`) but below all dashboard content.
- Modal dim: `setStarFieldModalDim(true/false)` drops to 22% instantly (bypasses the 18 s opacity transition).
- Respects `prefers-reduced-motion`.

### Cloud forecast strip (`cloud-forecast.js`)

- Fetches `/api/forecast/clouds` once on boot; re-renders when `refreshCloudSunTimes` fires.
- Shows 3 hours past + 8 hours ahead. Current slot uses animated Meteocons SVG; others use static.
- **`isNightHour(slotMs)`** — uses time-of-day (minutes since midnight in browser local time) against sunrise/sunset to determine night; handles multi-day windows correctly.
- **`selectIcon(point, isNight)`** — priority: WMO `weather_code` (authoritative) → precipitation amounts (safety net) → cloud-only fallback.
  1. `weather_code` switch (covers thunder, hail, fog, sleet/freezing precip, snow, rain/showers, drizzle).
  2. If the code is cloud-only (0–3) or missing, fall back to amounts: snow+rain → sleet, snow → snow, rain > 0.5 → rain, rain > 0.1 OR chance ≥ 30 % → drizzle.
  3. Cloud-only: code 3 → `overcast-{n}`; code 2 → `partly-cloudy-{n}`; codes 0/1 → `clear-{n}` (or `haze-{n}` if high cloud ≥ 40 % and opaque < 15 %).
  - `prefix` = `overcast-{n}` if **opaque cloud (low + mid) ≥ 60 %**, else `partly-cloudy-{n}`. Thin cirrus alone no longer forces the overcast prefix.
  - WMO codes handled directly: 45/48 fog, 51/53/55 drizzle, 56/57/66/67 freezing → sleet, 61/63/65 rain, 71/73/75/77 snow, 80/81/82 showers → rain, 85/86 snow showers, 95 thunder, 96/99 hail.
  - `thunderstorms-{n}-overcast` does not exist in the CDN — falls back to rain variant.
- Touch tooltip: `stopPropagation()` always fires on strip clicks so gap taps never close the tooltip unexpectedly.

### Astro forecast modal (`astro-forecast.js`)

- Triggered by `#astro-fc-btn` (below forecast strip, `id` must stay the same for JS binding).
- Fetches `/api/forecast/astro`; renders an SVG scroll chart showing seeing quality, cloud layers (high/mid/low), sun/moon altitude curves, and a "now" indicator.
- Seeing quality computed server-side by `SeeingCalculator` (Hufnagel-Valley model, jet stream + surface wind).

### Styling (`static/css/`)

- **`style.css`** — all dashboard styles. Design tokens in `:root`. Frosted-glass cards (`backdrop-filter: blur(18px) saturate(1.15)`). CSS `@property` for animated custom properties.
- **`pages.css`** — imported by `style.css`; additional page-specific styles.
- Icons: [Tabler Icons](https://tabler.io/icons) SVG inline for UI chrome (palette, adjustments-horizontal, moon-stars, etc.). [Meteocons](https://meteocons.com/) v3.0.0-next.10 from CDN for weather icons.
