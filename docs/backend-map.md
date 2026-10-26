# Backend map

A one-page orientation for coming back to the backend after a while: what runs, in what order,
and where each kind of rule lives. It says *where*; [`CLAUDE.md`](../CLAUDE.md) says *why*.
Paths are relative to `src/main/java/com/flather/weatherstation/`.

## 1. A reading comes in

```
MQTT broker ─▶ messaging/MqttConsumer ─▶ service/WeatherService.saveWeatherRecord
                                              ├─ DataQualityValidator   flags ANOMALY / MISSING / SPIKE
                                              ├─ WeatherReportRepository.save   → weather_records
                                              └─ SensorStateCache       recent window, today's min/max
```

- `POST /api/weather` (`WeatherController`) is the same path over HTTP, for testing without a broker.
- Nothing is dropped: a bad reading is **stored and labelled**, and readers filter on its quality.
- Spike detection needs recent values, which it reads from `SensorStateCache`, not the DB.
- `MqttConsumer` connects on `ApplicationReadyEvent`, retries with back-off and keeps retrying
  every 30 s; its connection state is the "MQTT broker" row in the health popover.

## 2. The dashboard asks for data

| Request | Path through the code | Reads from |
|---|---|---|
| `GET /api/weather/dashboard/live` (every 30 s) | `WeatherController` → `DashboardService.getDashboardLive` | **`SensorStateCache` (memory)**, Open-Meteo for API-backed metrics, `AstronomySearch` |
| `GET /api/weather/chart` (24-h chart) | `DashboardService.getChart` → `AnalyticsService` or `WeatherClientService` | `weather_records` (raw), or Open-Meteo |
| `GET /api/weather/quality` | `AnalyticsService.findLast24HoursQualityStrip` | `weather_records` |
| `GET /api/forecast/clouds` | `WeatherForecastController` → `WeatherClientService.getForecast` | Open-Meteo, or its last good forecast |
| `GET /api/astronomy/daily`, `/curve` | `AstronomyController` → `AstronomySearch` / `AstronomyEngine` | computed, no DB |
| `GET /api/weather/history/**` | `WeatherHistoryController` → `WeatherHistoryService`, `SummaryCardService` | `hourly_weather_record`, `daily_weather_record`, or raw for recent days |
| `/api/admin/**` (login required) | `ConfigController`, `DatabaseViewController` | `station_configuration`, `weather_records` |

Worth remembering:

- **The live dashboard does not query the database.** Current values, trends and today's min/max
  come from `SensorStateCache`, filled on every save and warmed at startup by
  `SensorCacheInitializer` from the last hour of readings. If a live value looks wrong, look there first.
- **Which source a metric uses** (sensor or Open-Meteo) is per-metric config, branched on in
  `DashboardService` — once for the live values, once for the chart.
- **Open-Meteo is optional and allowed to fail.** The live endpoint always answers; see
  "When Open-Meteo is down" in `CLAUDE.md`.

## 3. Things that run on their own

| What | Where | When |
|---|---|---|
| Rollups to hourly + daily rows, then delete raw older than 29 days | `WeatherRetentionService.rollUpAndCleanData` | 02:00–02:10 station time (5-min tick, window-gated) |
| Yesterday's daily rows, early | `WeatherRetentionService.generateYesterdaySummaryAtMidnight` | 00:05–00:15, skipped if already written |
| Reset today's min/max | `SensorStateCache.checkDailyReset` | every 20 s, acts on date change |
| Load config into memory | `ConfigurationInitializer` | startup |
| Warm the sensor window (last hour of readings) | `SensorCacheInitializer` | startup |
| Connect to MQTT | `MqttConsumer.initConnection` | application ready |

The rollup **recomputes the whole 29-day window every night**, so the tables repair themselves
after downtime. It also means raw data older than the window can't be imported: it is deleted on
the next run.

## 4. Memory, caches and events

| Thing | Holds | Refreshed |
|---|---|---|
| `ConfigurationCache` | location, zone, thresholds, data providers | startup; on `ConfigurationUpdatedEvent` |
| `SensorStateCache` | recent readings, spike windows, today's min/max, MQTT state | every saved reading |
| `apiWeather` (Caffeine) | the Open-Meteo response | 20 min TTL; failures not cached; cleared on config change |
| `OpenMeteoProvider.lastValidForecast` | last good forecast, for outages | each successful fetch; cleared on `LocationUpdatedEvent` |
| `sunDailyEvents`, `moonDailyEvents` | today's rise/set/twilight | keyed by date, 48 h TTL |

Saving station config in the admin panel publishes `ConfigurationUpdatedEvent` (refreshes
`ConfigurationCache`, evicts `apiWeather`); saving the location also publishes
`LocationUpdatedEvent` (drops the fallback forecast).

## 5. Where rules live

| Kind of rule | Lives in |
|---|---|
| Is a reading valid / a spike? | `DataQualityValidator`, thresholds in `WeatherValidationConfig` |
| Sensor freshness (`LIVE` … `OFFLINE`) | `DataStatus.fromLag` |
| Dew point, pressure trend, wetness % | `util/MeteoMath` (dew point and wetness also have SQL twins — keep them in step) |
| What "day" and "night" mean for a date | `AstronomySearch.getDayPeriodIntervalByDate` — the only definition |
| Chart aggregation and unit conversion | the repository queries themselves (raw and hourly tiers must agree) |
| Which history cards a metric gets | `SummaryCardService`; how each number is found: `SummaryAnalytics` |
| Error → HTTP status | `controller/GlobalExceptionHandler` |
| Entity ↔ DTO | MapStruct mappers in `mapper/`, never by hand |

## 6. Tables

| Table | Written by | Kept |
|---|---|---|
| `weather_records` | every reading | 29 days |
| `hourly_weather_record` | nightly rollup | forever |
| `daily_weather_record` (`FULL` / `DAY` / `NIGHT` per date) | nightly rollup | forever |
| `station_configuration` | admin panel | — |

Schema changes go through a new Flyway migration in `src/main/resources/db/migration/`; JPA only
validates.

## Getting your bearings before an edit

1. Find the endpoint in section 2, then read the controller and the service it calls.
2. Check section 4: is the value cached or held in memory somewhere?
3. Search `CLAUDE.md` for the class name to find the reasoning behind it.
4. Run the tests for that area (`./mvnw test -Dtest=ClassName`) before and after.
