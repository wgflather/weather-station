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
| `WeatherHistoryController` | `/api/weather/history` | Available dates, hourly records, `/chart/day` (one local day, the only chart endpoint), and `/daily` — chart data plus stat cards for one range and metric in a single payload |
| `ConfigController` | `/api/admin/config` | Station configuration CRUD (`GET`, `PUT` location/validation/hardware) |
| `DatabaseViewController` | `/api/admin/db` | Raw database view for admin |
| `LoginController` | `/login` | Login page |
| `GlobalExceptionHandler` | — | Unified error responses (`ApiErrorResponse`) |

### Services (`service/`)

- **`WeatherService`** — persists `WeatherRecord`, triggers validation via `DataQualityValidator`.
- **`DataQualityValidator`** — detects spikes and anomalies using median-based statistical methods; reads recent readings from `SensorStateCache`.
- **`AnalyticsService`** — time-series aggregation for 24-h charts (buckets of configurable resolution); also assembles the 24-h data-quality strip (`findLast24HoursQualityStrip`) — see below. `getMetricChart` covers every sensor metric and is an *exhaustive* switch over `Metric` with no `default`, so a metric added without a chart query fails the build rather than throwing on first request. `toChartPoints` is shared with `WeatherHistoryService` — see "Chart tiers" below.
- **`DashboardService`** — assembles the live dashboard DTO (metrics, system health, snapshots).
- **`AstronomyEngine`** — wraps the cosinekitty astronomy lib; computes sun/moon altitude curves, rise/set/twilight times, moon phase.
- **`AstronomySearch`** — binary-search horizon crossing finder used by `AstronomyEngine`.
- **`WeatherClientService`** — calls `OpenMeteoProvider` and maps the response to `WeatherConditionPoint` and `AstroForecastPoint` lists.
- **`SeeingCalculator`** — Hufnagel-Valley HV 5/7 atmospheric turbulence model; inputs are jet-stream speed (200 hPa) and surface wind speed; outputs FWHM seeing in arc-seconds (Excellent / Good / Fair / Poor / Very Poor).
- **`WeatherHistoryService`** — queries `HourlyWeatherRecord` and `DayPeriodMetrics` for the history modal; groups the per-period daily rows into one `FullDaySummary` per date. `getDayChart(date, metric)` is the only chart entry point: it resolves the date to midnight-to-midnight in the *station's* zone (not the caller's, which would straddle two station days and disagree with the per-period rows beside it) and routes on age — see `RAW_RETENTION_DAYS` below. `findHourlyDataPoints` is exhaustive over `Metric` for the same reason `getMetricChart` is. It once delegated to a `getChart(metric, from, to)` behind a second `/chart` endpoint; nothing consumed the range form, so both are gone.
- **`SummaryCardService`** — builds the history modal's stat cards per metric. Which period a metric reads, whether it answers with a date or an hour of the day, and whether it has a trend at all are per-metric decisions — see below. Humidity's builder is the only one that queries (twice), and the only one whose cards read nothing from the daily rows.
- **`WeatherRetentionService`** — scheduled hourly/daily rollups and raw cleanup, in a 02:00–02:10 window.
- **`StationConfigurationService`** — CRUD for `StationConfiguration`; publishes `ConfigurationUpdatedEvent` on save.
- **`DatabaseRawViewService`** — paged raw record queries for the admin view.
- **`MeteoMath`** (util) — dew point, pressure trend classification, surface wetness status. `rawToWetnessPct` is the definition of record for the wetness ADC→% formula, but it is only *called* by the live dashboard card; the charts convert in SQL (see "Chart tiers"), so the formula lives in two places and a change to what the baselines mean has to land in both. The dew point avoids that trap: `calculateDewPoint` also has a SQL counterpart, but the two share `DEW_POINT_A`/`_B`, which the query takes as parameters.

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

`domain/constant/` also holds `WindAggregation` — not an enum but the calm-speed and direction-consistency gates, shared by the hourly rollup and the raw wind-direction chart query so the two cannot drift apart.

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
`WeatherHistoryService` (raw-vs-hourly chart routing, now read only by `getDayChart` — a day inside
the window is bucketed live from `weather_record`, one beyond it comes pre-rolled from the hourly
table). They must agree; if the reader's value is the larger, chart requests near the boundary route
to raw rows that were already deleted and come back empty rather than falling back to the hourly
table.

### Chart tiers, and what each query must return

Every sensor metric charts from **two** interchangeable sources: `WeatherReportRepository`'s
`date_bin` queries over raw rows, and `HourlyWeatherRecordRepository`'s reads of the pre-rolled
table. `getDayChart` picks one on the day's age and neither caller knows which answered, so **each
pair of queries must return the same unit**. Conversions therefore live in the queries, not in Java:
whatever a chart query emits is charted as-is.

Not everything in `HourlyWeatherRecordRepository` is a chart tier, though. Two queries there serve
the summary cards, have no raw twin and are under none of the contracts below:
`findHumidityByHourOfDay` aggregates by hour *of the day*, and `findLowestDewPointGap` returns the
single hour of a range that came nearest to condensation. The first is also the only query in the
file that takes the station's zone, because bucketing a `TIMESTAMPTZ` by clock hour is the one thing
that cannot be done in UTC and corrected later.

`findLowestDewPointGap` computes the Magnus formula in SQL, with the coefficients passed in from
`MeteoMath.DEW_POINT_A`/`_B` so it cannot drift from `MeteoMath.calculateDewPoint`, which the live
dashboard card uses. Several published coefficient pairs exist and they differ by only ~0.02 °C —
which is exactly why a second hardcoded copy would go unnoticed rather than looking wrong. **It is
also one bad row from a 500:** `LN` is undefined at zero and Postgres *raises* there rather than
returning an infinity, so a single stored humidity of 0 % fails the query and, because the cards
travel with the chart data, takes the whole `/daily` response down. No such row exists today and 0 %
is a fault signature rather than a reading, so the floor belongs in validation — it is not there
yet.

Both tiers finish through `AnalyticsService.toChartPoints(points)`, which only maps the timestamp
into the station's zone and **drops null values**. It takes no `Metric` — deliberately, so it cannot
become the place metric-specific rules accumulate. The null-dropping is load-bearing rather than
tidiness: `ChartPointDto.hourlyValue` is a primitive `double`, a pre-rolled column is null for any
hour with no valid reading, and wind direction is null routinely — so passing one on unboxes to an
NPE. Dropping also matches the raw tier, whose `GROUP BY` simply yields no row for such a bucket; the
frontend reads a missing point as a gap either way.

Two metrics need real work in SQL:

- **Wind direction** cannot use the `ROUND(AVG())` shape every other query uses — averaging bearings
  numerically puts a bucket spent oscillating around north at 180°, due south. The raw query
  (`findChartWindDirection`) mirrors `rollupHourly`: unit-vector mean via `atan2(AVG(sin), AVG(cos))`,
  gated by `WindAggregation.CALM_THRESHOLD_MS` and `MIN_DIRECTION_CONSISTENCY` — shared constants
  precisely so the two sides gate identically. **The modulo runs after the rounding**, and the order
  matters: a mean wrapping through north lands on -1e-14, `+ 360` makes that 359.99999999999999, and
  rounding *after* the modulo lifts it back to exactly 360.0 — outside the [0, 360) the expression
  exists to enforce. Rounding first lets the modulo fold it to 0.
- **Surface wetness** is stored as a raw ADC count in all three tables and is charted as a
  percentage, converted inside *both* `findChartSurfaceWetness` queries with the baselines passed as
  parameters. Both wrap the average — `pct(AVG(x))` — rather than converting per reading. Per-reading
  conversion would be marginally better at the clamps, but the hourly tier stores an average of raw
  it cannot unpick, so the tiers would then disagree either side of the retention boundary;
  agreement is worth more. Note the transform is **decreasing**: a higher ADC count is a *drier*
  surface.

The daily rows convert in Java instead, because they are loaded as **entities** by derived queries
(`findByDateBetweenOrderByDateAsc`, `findByDate`) rather than as projections, so there is no query to
put the arithmetic in. `WeatherHistoryService.toWetnessPercentage` rescales each `PeriodMetricDto`
once, applied to the assembled map rather than inside the mapping loop — `putIfAbsent` means a
period already present is not re-mapped, and converting twice would square the transform.

**It swaps `min` and `max` rather than converting them where they stand.** Because the transform is
decreasing, the stored *minimum* ADC count is the wettest moment of the period and has to become the
*maximum* percentage; converting in place leaves `surfaceWetnessMin` holding the larger number and
labels the wettest moment "min". Both raw values are read before either is written, or the first
assignment feeds the second. This is the one asymmetry with the charts, which carry only `avg` and
so never meet it.

Storing percentages in the rollup instead would avoid the swap — `MIN(pct(x))` comes out already
correct — but it bakes the baselines into rows whose raw is later deleted, and the baselines are
editable from the admin panel, so a recalibration would repair only the self-healing window and
leave older history on the old numbers. Read-time conversion keeps recalibration retroactive.

`SummaryCardService` reads `DayPeriodMetrics` directly, so its wetness cards carry the inversion
too, but as a *selection* swap rather than a value swap: "Wettest day" is built by `extremeLow` —
the smallest stored count — and reported as an `EXTREME_HIGH`, because converted it is the largest
percentage on screen. `extremeHigh`/`extremeLow` therefore take the `CardKind` and a display
transform separately from the row selection; the four-argument overloads pass `AS_STORED` and the
matching kind, so the other metrics read exactly as before.

Wetness gets **two cards, not three** — no trend. The other metrics vary continuously, so a
least-squares fit over daily averages means something; wetness is close to bimodal and event-driven
(dry for days, soaked for an afternoon), so a slope over it reports where the wet days fell in the
range rather than a direction the weather took.

Frontend: surface wetness is wired through — a `Wetness` tab in `index.html`, a `surfaceWetness`
entry in `metric-units.js`, a `COLOR_SCALES`/`METRIC_CONFIG` pair in `chart-metrics.js`, and
`DEFAULT_PERIODS` + `IDENTITY_STOP` entries in `daily-chart.js` (the latter only because its
`METRIC_CONFIG.lineColor` is null). Its colour ramp puts its stops on `SurfaceWetnessStatus`'s own
boundaries (10 / 40 / 70), so the line changes colour where the status label would, and it is
teal-led rather than blue so a 0-100 % wetness chart is not mistaken for humidity. Nothing else
charts the remaining metrics: wind, wind direction and UV have backend queries but no tab, no unit
and no config, so `unitFor` returns `''` for them.

Reading side: `FullDaySummary` carries the three metric blocks plus `dayPeriod` / `nightPeriod`
windows, recomputed on read rather than stored. The windows are populated only by
`/daily/summary` (one date) — `/daily` passes null, since across a range every day has its own
sunrise. Each window is emitted only when its metrics block exists, so a caption never sits above a
row of dashes.

`/daily` returns `DailyHistoryDto` — `days` (one `FullDaySummary` per date) plus `summary` (the
cards) — from a single query. They are bundled because the modal reloads the range on every metric
tab anyway, so separate calls only cost a second round trip. A metric with no card builder yields an
empty card list rather than an error, so its chart still renders.

Every card decision in `SummaryCardService` is per-metric, not a default. Four axes, each chosen per
metric and each stated in the builder's own javadoc:

**What shape the answer takes.** Most cards name a *date* and are built from the daily rows the
caller already loaded. Humidity's two extremes name an *hour of the day* instead — "Most humid
stretch 94 %, 23:00–02:00" — because its cycle is strong, inverted against temperature and repeats
nightly, so "which day was most humid" mostly reports which airmass happened to sit over the station,
while "which hours are reliably the most humid" describes the site itself. It is also the one thing
the chart beside the cards cannot show, since that carries one point per day. Its third card names a
single *date and hour* — the closest approach to dew — because at that resolution the hour is half
the answer: the same spread at 03:00 is an ordinary clear night and at 14:00 is fog.

Humidity is therefore the only builder that goes back to the database, and it makes **two** queries:
`findHumidityByHourOfDay` for the diurnal buckets and `findLowestDewPointGap` for the dew card. Only
the humidity tab pays for them, and the modal reloads the range on *every* metric tab, so that is
per click rather than per open. The fetches sit in the builder rather than in `WeatherHistoryService`
precisely so the choice stays next to the reasoning for it; hoisting them into the caller would put
"humidity needs hourly rows" in a class that otherwise knows nothing about which metric wants what.

The dew card is the one place a card's number is **not in its tab's unit** — it is a temperature
spread in °C on a tab measured in percent. It says so with `unitMetric`, which carries a metric's
request key rather than a unit string, so `metric-units.js` stays the only place a unit is written
down. Without it the frontend appends the tab's unit and renders "1.7 %". It also reports the
*spread* rather than the dew point itself, because a dew point alone says nothing about
condensation — 12 °C is unremarkable at 20 °C air and means water on every surface at 13 °C — and the
gap is what `DewPointRisk` classifies.

**Which period.** Temperature takes *one card from each side of the split* — "Warmest day" from
`DAY`, "Coldest night" from `NIGHT` — because that is the pair of questions the day/night rows exist
to answer. Both cards previously read `DAY`, which wasted half the split and produced a daytime
*low*: a quantity nobody asks for, since the cold part of a date happens before dawn and lives in
that date's `NIGHT` row. Pressure and wetness read `FULL`, because their extremes fall outside
daylight — a depression bottoming out at 03:00, dew that forms after dark. Humidity's extremes read
no period at all, only its trend does. Consequence to expect: a range of dates rolled up before the
split has `FULL` rows only, so temperature yields **no** extreme cards for it rather than falling
back.

**Ranked on the average or on the extreme.** Temperature ranks on the period *average*; pressure and
wetness on the stored min/max. The label has to match what the number measures — a "Warmest day"
answered by the single highest sample is a claim about a day answered by a property of a moment, set
by whichever minute the sun was on the enclosure, and not comparable between days. Pressure keeps the
extreme because the deepest low *is* the storm, and wetness because its peak answers "did it get wet
at all" while its mean is near zero for days.

**Whether there is a trend at all.** Only temperature and pressure have one. Wetness never did — a
least-squares fit over a bimodal, event-driven signal reports where the wet days fell in the range,
not a direction. Humidity's went when its cards moved to hours of the day: over a week a humidity
slope mostly reports which airmass sat over the station, and over a month it reports seasonal drift
already legible on the chart, so it was low-information rather than wrong. A consequence worth
knowing: humidity now reads **nothing** from the daily rows, and `buildSummary` still receives them
only for the other three metrics. Thresholds are likewise per-metric: 0.5 °C is a real shift, 0.5 hPa
is noise.

The two diurnal cards rank **three-hour windows**, not single hours. The width is fixed rather than
chosen per range, and deliberately not a "best of 2 or 3": a narrower window can always drop its
worst hour and so scores more extreme in *both* directions, which means letting the width vary would
simply return the narrowest one every time. Three is wide enough that the winner shifts smoothly —
neighbouring windows differ by swapping one hour in and one out — where a single-hour pick flips
between near-tied hours on reload. Relative humidity pins near 100 % through the small hours, so the
overnight maximum is a near-tie by nature; that is the same objection that kept the old day-ranked
card off the peak, reappearing on a different axis.

Three things the scan has to get right, each with a test naming it:

- It **wraps past midnight.** The most humid stretch of a clear night genuinely runs 23:00 → 02:00,
  and a scan stopping at hour 23 would report the second-best answer without saying so. `windowEnd`
  is then *earlier* on the clock than `windowStart` — correct, not a pair to reorder.
- The query's end bound is **`to.plusDays(1)`**. `to` is an inclusive date and the bound is
  half-open, so stopping at `to` silently drops the newest day of every range — the one the reader
  is most likely looking at — while the chart beside it still charts that day.
- An hour observed on fewer than 70 % of the range's days is **unrankable**, and a window containing
  one is skipped whole rather than averaged around: a mean over two hours is not comparable with the
  three-hour means it would be ranked against. `HourOfDayAverage` carries the `samples` count for
  exactly this. If no window survives, the cards are omitted like any other card with nothing behind
  it.

`SummaryCard` therefore carries one of **four** context shapes, with the unused fields null:

| Shape | Fields | Renders as | Used by |
|---|---|---|---|
| A day | `date` | "Aug 30" | the day extremes |
| A span of days | `rangeStart` + `rangeEnd` | "Aug 30 → Sep 5" | the trends |
| A recurring stretch | `windowStart` + `windowEnd` | "23:00–02:00" | the diurnal extremes |
| One reading at one hour | `date` + `windowStart` | "Sep 5, 20:00" | the dew point card |

The last two reuse `windowStart` for different things — a window opening, and the hour a single
reading landed on — which is why the two are told apart by whether `windowEnd` arrived. Both are
**wall-clock at the station**, not instants, and `summary-cards.js` renders them verbatim rather than
through `toLocaleTimeString`: a viewer in another zone must read the hour the station experienced, or
the caption disagrees with the chart below it, which resolves its own days in the station's zone too.

The frontend picks its caption from *which fields arrived*, never from `kind`. That is what let the
last two shapes be added server-side with one branch each, and it is why a card's question belongs in
its `label` rather than in a new `CardKind` — kinds say how to read the number (a high, a low, a
signed change), which is what the styling keys on. "Closest to dew point" is an `EXTREME_LOW`
carrying its own label, not a kind of its own.

`extremeHigh`/`extremeLow` take a `Function<DayPeriodMetrics, Double>` that supplies **the value the
card displays**, and rank on that same function — selection and display must not come from different
columns, or a card picks its day by one quantity and prints another. The accessor is also what the
null filter runs on, so a period row whose metric is null (a night the sensor missed,
`getMinByMetric(UV_INDEX)` which is always null) is skipped rather than reaching
`Comparator.comparing` and throwing.

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
| `daily-chart.js` | Multi-day chart used by the history modal: a value-coloured min/max band per day, plus one average line per visible period. Owns `DEFAULT_PERIODS` (which periods each metric opens with) and exports `periodColor()` so the legend swatches match the lines |
| `FetchScheduler.js` | Incremental chart data fetcher (fetches only new buckets) |
| `quality-strip.js` | 24-h data-quality strip inside metric status-circle popovers; owns the shared `/api/weather/quality` fetch cache |

**History and admin**

| File | Role |
|---|---|
| `history-modal.js` | History chart modal (date picker + range tabs, period breakdown, legend toggles) |
| `summary-cards.js` | The history modal's stat cards — formats the values in `/daily`'s `summary` block. Picks a caption from which context fields arrived (date / date range / time window / date + hour), not from `kind`, and takes a card's unit from `unitMetric` when it differs from the tab's |
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

**Charting a metric for the first time means adding it to three separate per-metric tables**, and only two of them fail visibly: `METRIC_CONFIG` and `COLOR_SCALES` in `chart-metrics.js` both fall back to temperature (`?? METRIC_CONFIG.temperature`), so a missing entry renders the wrong colours rather than erroring — while a missing `COLLISION_STATE` entry used to throw `Cannot set properties of undefined` and leave the previous chart on the canvas, which reads as "the tab didn't switch". `collisionStateFor()` now creates the entry on demand, so the omission is no longer fatal; the entry must still be *stored* rather than defaulted, or the hysteresis above is defeated. The multi-day chart used to be a fourth table, `DAILY_CFG` in `daily-chart.js`, whose colours contradicted all three of these — daily humidity was emerald while the 24-h chart's is slate-to-blue, which also collapsed the teal-vs-blue separation wetness was given on purpose. It now imports `COLOR_SCALES` and `METRIC_CONFIG` and holds no hex values of its own, so these three tables are the whole set.

### The daily chart's band, and what it is allowed to annotate

`daily-chart.js` draws a **shaded band between each day's recorded min and max**, with one
average line per visible period on top. The band is the FULL day's envelope and is
deliberately independent of whether the All day *line* is drawn — under the default period
sets that line is usually hidden, and the band is what represents the whole day.

It is filled with `createDynamicGradient` at low alpha, so a height on this chart carries
the same colour it does on the 24-h chart: red at 40 °C, pale at 7 °C. A flat tint cannot
say that, and a band spanning half the axis in one colour reads as decoration. The alpha
matters more than it looks — below ~0.15 every stop desaturates toward the page background
and the whole ramp collapses into one muddy colour. Its edges carry a thin stroke for a
related reason: at `borderWidth: 0` the min and max are the boundary of a shape rather than
data, and nothing on screen says they are series at all.

**The only annotation is the highest and lowest value recorded in the range**, marked on
the band edge it belongs to. There are deliberately no H / L markers on the average lines
any more. They marked a weaker fact — the day with the highest daily *mean* — in a louder
visual form, while the band above them visibly reached higher: two "highests" in two
languages, the louder one the smaller number. The summary cards above the chart already
name the warmest day with a value and a date, which the marker never could.

`DEFAULT_PERIODS` decides which periods a metric opens with, and it is measured rather than
assumed. Comparing the mean |day − night| gap against the day-to-day movement of the
whole-day mean over 30 days of this station's rows: temperature 2.63x, humidity 3.35x,
surfaceWetness 1.00x, pressure 0.36x. Pressure therefore shows **All day alone** — its two
period lines sit on top of each other and add nothing. Wetness looks borderline on that
ratio and is not: it is flat for 27 days a month and then one night runs 10–25 pp wetter
than its day, which is dew and is the entire reason the sensor exists, so it keeps the
split. A mean is the wrong summary of a signal that bimodal.

Consequences worth knowing:

- **All day is neutral, not the metric's colour.** Daylight and Night are anchored to the
  dashboard's amber and indigo sun/moon accents, so a metric-derived All day collides —
  orange against amber on temperature, and the old violet was nearly indistinguishable from
  Night's indigo on pressure. The band behind it carries the metric identity instead.
- **Where `METRIC_CONFIG.lineColor` is null** (temperature, wetness — the metrics the 24-h
  chart draws with a gradient) there is no flat colour to borrow, so `IDENTITY_STOP` pins
  one to a stop on that metric's own scale. It must not be derived from the range average:
  wetness averages ~1.5 %, whose stop is near-white, so a mean-derived colour turns the
  wetness chart white.
- **The glow only fires when a single dominant line is drawn.** With Daylight and Night
  both up there is no primary, and glowing both fogs the plot.
- **`history-modal.js` remembers shown periods per metric.** It was one shared Set, so that
  hiding Night survived a metric switch. That still holds within a metric, but one Set
  cannot also carry per-metric defaults — the first metric visited would dictate the rest.
- A caption under the legend states the encoding ("Line — period average", "Band — that
  day's recorded high and low"). Without it a shaded band reads as a confidence interval, a
  forecast, or decoration. Both it and the legend belong to the multi-day chart only, and
  `hideChartChrome()` takes them down with the canvas on the empty and error paths —
  `loadRange` switches them on before the fetch resolves, so a range that comes back empty
  has to undo that.

**A trap this file has now hit four times: `[hidden]` loses to `display: flex`.** The
browser's `[hidden] { display: none }` comes from the *UA* stylesheet, so any author rule
setting `display` on the same element beats it and the `hidden` attribute silently does
nothing. `pages.css` carries explicit `[hidden]` restorations for `.provider-dew-warn`,
`.db-range-inputs`, the history canvas, and now `.hist-legend` / `.hist-chart-note` /
`.hist-summary-cards`. The legend case is worth remembering because it hid *by accident* for
a long time: it only looked hidden on the single-day view while it was still empty, and the
bug appeared only after a multi-day range had populated it — switching back to a single day
then left its period switches on screen, offering to toggle series that view does not draw.
**Any new flex or grid container toggled through `.hidden` needs its own rule.**

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
