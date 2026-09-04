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
| `WeatherController` | `/api/weather` | Ingest (`POST`), live dashboard, 24-h chart, data-quality strip (`/quality`) |
| `WeatherDashboardController` | `/` | Serves the Thymeleaf dashboard (`index.html`) |
| `WeatherForecastController` | `/api/forecast` | Cloud strip (`/clouds`) and astro forecast (`/astro`) |
| `AstronomyController` | `/api/astronomy` | Daily sun/moon events (`/daily`), altitude curve (`/curve`) |
| `WeatherHistoryController` | `/api/weather/history` | Available dates, hourly records, day chart, and `/daily` — chart data plus stat cards for one range and metric in a single payload |
| `ConfigController` | `/api/admin/config` | Station configuration CRUD (`GET`, `PUT` location/validation/hardware) |
| `DatabaseViewController` | `/api/admin/db` | Raw database view for admin |
| `LoginController` | `/login` | Login page |
| `GlobalExceptionHandler` | — | Unified error responses (`ApiErrorResponse`) |

### Services (`service/`)

- **`WeatherService`** — persists `WeatherRecord`, triggers validation via `DataQualityValidator`.
- **`DataQualityValidator`** — detects spikes and anomalies using median-based statistical methods; reads recent readings from `SensorStateCache`.
- **`AnalyticsService`** — time-series aggregation for 24-h charts (buckets of configurable resolution); also assembles the 24-h data-quality strip (`findLast24HoursQualityStrip`) — see below.
- **`DashboardService`** — assembles the live dashboard DTO (metrics, system health, snapshots).
- **`AstronomyEngine`** — wraps the cosinekitty astronomy lib; computes sun/moon altitude curves, rise/set/twilight times, moon phase.
- **`AstronomySearch`** — binary-search horizon crossing finder used by `AstronomyEngine`.
- **`WeatherClientService`** — calls `OpenMeteoProvider` and maps the response to `WeatherConditionPoint` and `AstroForecastPoint` lists.
- **`SeeingCalculator`** — Hufnagel-Valley HV 5/7 atmospheric turbulence model; inputs are jet-stream speed (200 hPa) and surface wind speed; outputs FWHM seeing in arc-seconds (Excellent / Good / Fair / Poor / Very Poor).
- **`WeatherHistoryService`** — queries `HourlyWeatherRecord` and `DayPeriodMetrics` for the history modal; groups the per-period daily rows into one `FullDaySummary` per date.
- **`SummaryCardService`** — builds the history modal's stat cards (warmest/coldest/trend) per metric. Which period a metric reads is a per-metric decision — see below.
- **`WeatherRetentionService`** — scheduled hourly/daily rollups and raw cleanup, in a 02:00–02:10 window.
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

**Entities:** `WeatherRecord`, `StationConfiguration`, `HourlyWeatherRecord`, `DayPeriodMetrics` (one row per date *per period* in `daily_weather_record`).

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
| V6 | Data-provider configuration columns on `station_configuration` |
| V7 | `wind` / `uv_index` columns (+ quality columns, validation thresholds) |
| V8 | `wind_direction` column (+ quality column) |
| V9 | Index on `weather_records (measured_at DESC)` |
| V10 | Wind/UV columns on both rollup tables, `period` discriminator on `daily_weather_record` (unique key becomes `(device_id, date, period)`) |

Note on indexes: V1 created three `(quality, measured_at DESC)` composites for temperature, pressure and humidity only — nothing equivalent exists for surface wetness, wind, wind direction or UV index. Those composites only help queries filtering on a *rare* quality (`SPIKE`/`ANOMALY`); `= 'OK'` matches almost every row, so the planner ignores them. V9's plain `measured_at` index is what serves the time-range queries (quality strip, retention, raw admin view, charts).

Local DB: `localhost:5432/weather` (`application-local.yml`). Active profile: `local`.

### Day / night periods (`daily_weather_record`)

Each date holds up to three rows, keyed by `(device_id, date, period)`:

| Period | Window | Written when |
|---|---|---|
| `FULL` | local midnight → midnight | always |
| `DAY` | this date's sunrise → sunset | the sun crosses the horizon |
| `NIGHT` | **previous** date's sunset → this date's sunrise | as above |

**The three do not partition the date, and that is deliberate.** A night is contiguous — it runs
from the previous evening through to this morning — so this date's evening counts towards its own
`FULL` row and towards the *following* date's `NIGHT`. The alternative, splitting night at midnight,
welds an evening onto the pre-dawn hours of a different night and puts the coldest and warmest parts
of two separate nights in one row. Readers that stack the three periods must not imply they sum.

`AstronomySearch.getDayPeriodIntervalByDate(date, period)` is the single definition of these windows
and is called by both sides: `WeatherRetentionService` when writing the aggregate, and
`WeatherHistoryService` when describing it to the client. Keep it that way — two copies of "night for
date D" would let the caption drift from the numbers it labels. It deliberately is **not**
`@Cacheable`: every other cache in that class keys on `dailyKey()` (today), which would hand back
today's window for all 29 dates of a rollup run and silently write wrong aggregates. It returns
`DayPeriodInterval`, whose `isValid()` rejects polar days (no crossing) and the near-polar case where
a sunset resolves just after midnight and pairs into a 30-hour "night" — hence the 24-hour ceiling.
When either window is invalid, only `FULL` is written.

Both rollups **upsert across the whole raw-retention window on every run**, not just yesterday. That
makes the tables self-healing — downtime, a late reading, or a newly added column is repaired on the
next pass instead of needing a backfill — and it means changing a window definition re-forms the
existing rows within a day. It also makes ordering load-bearing: `deleteRawOlderThan` runs *after*
the loop, because the oldest date's night reaches into the previous date's evening.

`RAW_RETENTION_DAYS` is declared in both `WeatherRetentionService` (what gets deleted) and
`WeatherHistoryService` (raw-vs-hourly chart routing). They must agree; if the reader's value is the
larger, chart requests near the boundary route to raw rows that were already deleted and come back
empty rather than falling back to the hourly table.

Reading side: `FullDaySummary` carries the three metric blocks plus `dayPeriod` / `nightPeriod`
windows, recomputed on read rather than stored. The windows are populated only by
`/daily/summary` (one date) — `/daily` passes null, since across a range every day has its own
sunrise. Each window is emitted only when its metrics block exists, so a caption never sits above a
row of dashes.

`/daily` returns `DailyHistoryDto` — `days` (one `FullDaySummary` per date) plus `summary` (the
cards) — from a single query. They are bundled because the modal reloads the range on every metric
tab anyway, so separate calls only cost a second round trip. A metric with no card builder yields an
empty card list rather than an error, so its chart still renders.

Card periods are a per-metric decision in `SummaryCardService`, not a default: temperature reads
`DAY` (that is what "warmest day" means), while pressure and humidity read `FULL` because their
extremes fall outside daylight — a depression bottoming out at 03:00, a humidity peak before dawn.
Trend thresholds are per-metric for the same reason: 0.5 °C is a real shift, 0.5 hPa is noise.

### DTOs & Mappers

MapStruct mappers in `mapper/` handle all entity↔DTO conversion — never map manually. Key DTO packages:
- `dto/analytics/` — temperature, pressure, humidity, wetness, trend result, `FullDaySummary`, `MetricSummary`, `SummaryCard`
- `dto/astronomy/` — daily events, sun/moon snapshots, twilight times, curve points, `DayPeriodInterval`
- `dto/dashboard/` — live dashboard, chart, system health
- `dto/forecast/` — `WeatherConditionPoint`, `AstroForecastPoint`, `ForecastDto`, `AstroForecastDto`
- `dto/weather/` — weather record create/response
- `dto/projection/` — `DataPoint`, `ExtremesProjection`

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
| `static/admin/config.html` | `/admin/config.html` | Station configuration admin panel |
| `templates/login.html` | `/login` | Login page |

History has no standalone page — it opens as a modal from the dashboard (`history-modal.js`).

### JavaScript modules (all under `static/js/`)

`index.html` loads only five scripts: `realtime-script.js` (a plain script, runs synchronously before the rest) plus four `type="module"` entry points — `fetch-data.js`, `history-modal.js`, `cloud-forecast.js`, `equalize-card-height.js`. Everything else is reached through `import`. `/admin/config.html` loads `config.js` and `database-view.js`; neither is used by the dashboard.

**Dashboard shell**

| File | Role |
|---|---|
| `realtime-script.js` | Clock, date/time DOM updates (runs every second) |
| `fetch-data.js` | Orchestrator: live polling (30 s), astronomy glue, chart scheduler + resolution controls, boot wiring. Owns the dashboard `state` object |
| `metric-cards.js` | The metric cards — temperature, pressure, humidity/dew, surface wetness, wind, UV — plus the staleness hints. Entry point `renderMetrics(dto, dataStatus)` |
| `system-health.js` | Header status dot, its label, and the lag / MQTT / records popover |
| `metric-popovers.js` | Status-circle and badge popovers; owns the shared `#global-popup` and `closeAllPopovers()` |
| `modal-shell.js` | Shared modal plumbing: one depth-counted body scroll lock and a focus trap, used by the astro and history modals |
| `dashboard-constants.js` | Enum → colour / label lookup tables shared across cards, health and popovers |
| `equalize-card-height.js` | Keeps dashboard card heights in step |

**Sky, stars and astronomy**

| File | Role |
|---|---|
| `sky-background.js` | Altitude-driven page gradient, browser-chrome tint, and the dynamic/static background preference. Owns `getStarAltitude()` |
| `sky-colors.js` | Sky/sun colour ramps shared by `sky-background.js`, `sun-curve.js` and `sun-modal-chart.js` |
| `star-field.js` | Atmospheric star field canvas + CSS-animated highlights |
| `sun-curve.js` | Sun card's daily-arc SVG, its markers, and the sun/moon countdown heroes |
| `moon-canvas.js` | Moon phase canvas renderer |
| `astro-modal.js` | Sun and moon detail modals |
| `sun-modal-chart.js` | Sun modal SVG chart: whole-day altitude curve with twilight gradient, label chips, scrubbing |
| `cloud-forecast.js` | Hourly cloud/weather forecast strip; icon selection; tooltip |
| `time-format.js` | Shared time-of-day and duration formatters |

**Charts**

| File | Role |
|---|---|
| `weather-chart.js` | Orchestrates the 24-h chart: chart state, datasets, Chart.js lifecycle. Entry point `renderWeatherChart()` |
| `chart-metrics.js` | Per-metric config (`METRIC_CONFIG`), value → colour ramps (`COLOR_SCALES`), and the line/area gradients derived from them |
| `chart-series.js` | Pure point-array transforms: gap detection, dynamic y bounds, extremes |
| `chart-labels.js` | H / L / Now label geometry, the collision engine, and the `minMaxLabels` Chart.js plugin |
| `chart-interaction.js` | The 24-h chart's external tooltip handler, its placement, and touch suppression |
| `chart-tooltip.js` | The single floating tooltip element, shared with `daily-chart.js` |
| `daily-chart.js` | Multi-day chart used by the history modal; one avg line per visible period. Exports `periodColor()` so the legend swatches match the lines |
| `FetchScheduler.js` | Incremental chart data fetcher (fetches only new buckets) |
| `quality-strip.js` | 24-h data-quality strip inside metric status-circle popovers; owns the shared `/api/weather/quality` fetch cache |

**History and admin**

| File | Role |
|---|---|
| `history-modal.js` | History chart modal (date picker + range tabs, period breakdown, legend toggles) |
| `summary-cards.js` | The history modal's stat cards — formats the values in `/daily`'s `summary` block |
| `metric-units.js` | The one place a metric's display unit is written down; used by the modal, its cards and the daily chart |
| `available-dates.js` | Factory for the flatpickr "only enable days that have data" pickers; shared with `database-view.js` |
| `database-view.js` / `config.js` | Admin pages only, not loaded by the dashboard |

Both modals go through `modal-shell.js` for scroll locking and focus containment; neither may lock `<body>` itself. The lock is counted by modal depth, so only the outermost open and close touch `<body>` — locking per-modal meant the second modal read `window.scrollY` while the body was already fixed, saved 0, clobbered the first modal's offset, and unlocked the background on the first close, leaving a modal open over a scrollable page.

`available-dates.js` is a factory rather than a singleton because its two callers hit different endpoints (`/api/weather/history/available-dates` and `/api/admin/available-dates`), so each instance owns its month cache. `isDateEnabled()` answers from cache only — a month that has not loaded reads as "nothing enabled", and `ensureMonthsLoaded()` redraws once the fetch resolves, which is why a picker briefly shows every cell disabled when it first opens.

### Cross-module communication (window globals)

Modules that need to talk to each other use `window.*` since they load independently. Do not remove these without updating all callers.

| Global | Set by | Read by | Purpose |
|---|---|---|---|
| `window.refreshCloudSunTimes(riseIso, setIso)` | `cloud-forecast.js` | `fetch-data.js` (calls it after astronomy loads) | Re-renders strip with correct day/night icons |
| `window.getCurrentCloudCover()` | `cloud-forecast.js` | `star-field.js` | Cloud cover multiplier for star opacity |
| `window.setStarFieldModalDim(bool)` | `fetch-data.js` (re-exports from `star-field.js`) | `history-modal.js` | Dims stars while any modal is open |

### Sky background system (`sky-background.js`)

The page background gradient is driven by the current sun altitude, updated on every 30-second poll:

- **`SKY_ANCHORS`** — 8-entry table mapping altitude (−18° to +50°) to top/bottom gradient RGB, card surface color, and sky-ambient glow color.
- **`computeSkyColors(altDeg)`** — linearly interpolates between bracketing anchors.
- **`applySkyColors(colors, snap)`** — writes to CSS custom properties on `:root`. The `snap` flag bypasses the 12 s CSS transition for instant switches.
- **`@property`** typed custom properties (`--bg-grad-top`, `--bg-grad-bottom`, `--card-bg`, etc.) enable CSS color interpolation between values.
- **Background preference** (dynamic / static preset) is persisted in `localStorage` as `bgPreference`. Static mode uses a fixed anchor; dynamic mode follows live sun altitude. `getStarAltitude()` reads the preference to supply the correct effective altitude to the star field, and `moonAmbientFor()` uses it so a pinned preset also tints the moon disk.

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

### Astro forecast — backend only, no frontend

`WeatherForecastController` serves `/api/forecast/astro`, and `SeeingCalculator` computes seeing quality server-side (Hufnagel-Valley, jet stream + surface wind). **Nothing consumes it.** There is no `astro-forecast.js` and no `#astro-fc-btn` anywhere in the templates, JS or CSS — this doc previously described that module as if it existed. Either build the frontend or retire the endpoint; don't trust the old description.

### 24-hour chart modules (`weather-chart.js` + `chart-*.js`)

Chart.js and its date-fns adapter come from the CDN as globals — none of these modules import them.

`weather-chart.js` keeps the orchestration (chart state, datasets, Chart.js lifecycle) and delegates the rest. Three contracts survive the split and are easy to break:

- **`chart-labels.js` is imported partly for its side effect.** It defines `minMaxLabelsPlugin` and calls `Chart.register()` at module load. The chart config only names the plugin by its id, `'minMaxLabels'`, so nothing else keeps the import alive — dropping it silently removes the H / L / Now labels.
- **The plugin reads `chart.$state`.** `computeChartState()` builds the state; `createChart()` and `updateChart()` stash it on the chart instance each pass so dataset callbacks and plugins read current analytics without the chart being destroyed and rebuilt. `resolveCollisionScenario()` fills in the `scenario` field the plugin dispatches on.
- **`COLLISION_STATE` is per-metric hysteresis that persists across renders.** The module stays loaded across the 20 s polling cycle deliberately: entry and exit thresholds differ so layouts don't flicker as new data crosses a boundary. Resetting it per render would reintroduce the flicker.

**Tooltip ownership.** `chart-tooltip.js` owns the single floating element and is the only writer of its structure, via `setTooltipContent(el, titles, bodies)`. Both the 24-h chart (`chart-interaction.js`) and the history modal's daily chart (`daily-chart.js`) render through it. They previously each created the element with different internals — one replacing `innerHTML` wholesale, the other seeding `.title`/`.body` children and querying them — so whichever drew first won and the other read into markup it had not built. Placement stays per-chart: the 24-h chart flips against the plot area and pins to the card on touch, the daily chart clamps to the viewport.

### Data-quality strip (`quality-strip.js`)

A 6 px bar inside a metric card's status-circle popover, answering "has this sensor *been* healthy?" alongside the popover's existing "is this reading trustworthy right now?".

**Endpoint.** `GET /api/weather/quality` returns one `QualityStrip` covering **every** sensor-backed metric — 48 half-hour buckets, per-metric summaries, and the list of gaps. One ~4 KB payload serves all five popovers, so `fetchQualityStrip()` caches the **promise** (not the value) for 60 s; caching the promise also dedupes two popovers opened in quick succession. Metrics configured as `EXTERNAL_API` are omitted server-side — Open-Meteo values never pass through `DataQualityValidator`.

**Window anchoring.** `AnalyticsService.findLast24HoursQualityStrip()` floors `now` to the current 30-minute slot and makes that the *last* bucket, so the strip always ends at "now". Consequence: the final bucket is partial by construction, and the client prorates its expected reading count by elapsed fraction — otherwise the right edge would read as degraded permanently.

**Bucket states**, first match wins. `expected` is the median non-empty bucket total, derived from the data because the reporting interval isn't configured anywhere:

| Order | State | Condition |
|---|---|---|
| 1 | `EMPTY` | `totalCount === 0` — no row at all |
| 2 | `ANOMALY` | any reading out of range |
| 3 | `SPIKE` | any reading flagged as a spike |
| 4 | `MISSING` | ≥ 50 % of rows had no value for this metric |
| 5 | `PARTIAL` | fewer than 50 % of expected readings |
| 6 | `OK` | — |

Events win outright over coverage states: at 48 buckets a single spike tints ~2 % of the bar, which is proportionate. Colours live in `STRIP_COLORS`, deliberately **not** `DATA_QUALITY_COLORS` — the latter's `MISSING` (`#111827`) reads as a hole punched through the bar. `EMPTY` is darker than the track (a notch — the station was silent), `MISSING` is muted slate (rows arrived, this field was null).

**Gaps.** Outages are *absent rows*, not `MISSING` rows, so they can't be seen in the quality columns at all. `WeatherReportRepository.findGaps` unions the window edges in as sentinel timestamps so `LAG` also catches leading and trailing gaps — the trailing one (died and never came back) being the case a plain row-to-row scan misses. `minGapMinutes` scales with observed cadence (`max(15, cadence × 3)`), without which every consecutive pair of readings is technically a gap. Gaps render as an overlay at their **true** timestamps, not snapped to buckets: a 20-minute outage inside a 30-minute bucket is invisible in the bucket layer.

**Scrubbing.** Pointer over the strip rewrites the caption line in place (`11:00–11:30 · 30 readings · 2 spikes`) rather than opening a tooltip — a tooltip would be clipped by the 210 px popover and is awkward nested on touch. Listeners bind to the padded `.qstrip-track` (20 px tall) but measure `.qstrip-bar`, so the hit area is usable without skewing the x-to-bucket mapping. Only `pointerType === 'mouse'` reverts on leave; a touch pointer stops existing on lift, so reverting there would blank the readout before it could be read. `click` is `stopPropagation()`-ed because `metric-popovers.js` closes the popover on *any* document click with no containment check.

### Styling (`static/css/`)

- **`style.css`** — all dashboard styles. Design tokens in `:root`. Frosted-glass cards (`backdrop-filter: blur(18px) saturate(1.15)`). CSS `@property` for animated custom properties.
- **`pages.css`** — imported by `style.css`; additional page-specific styles.
- Icons: [Tabler Icons](https://tabler.io/icons) SVG inline for UI chrome (palette, adjustments-horizontal, moon-stars, etc.). [Meteocons](https://meteocons.com/) v3.0.0-next.10 from CDN for weather icons.
