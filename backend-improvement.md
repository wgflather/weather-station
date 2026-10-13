# Backend Improvement Audit

Audit date: 2026-06-14  
Scope: all Java source files under `src/main/java`

---

## Critical

### 1. Spike window updated before the DB write commits/done
**File:** `WeatherService.java:102-112`

`updateCache(...)` is called for all three metrics before `repository.save(record)`. If `save` throws (constraint violation, connection loss, etc.), the in-memory spike reference window already holds values from a record that was never persisted. On the next valid reading, the median is skewed by phantom data.

**Fix:** move all `updateCache` calls to after the `repository.save` line, alongside the existing `sensorStateCache.setLastSavedMeasurement` call.

---

### 2. `metricsWindow` deque exposed as a live mutable reference /done
**File:** `SensorStateCache.java:25` (`@Getter` on `metricsWindow`)

`getMetricsWindow()` returns the actual `ArrayDeque<WeatherRecord>`. Any caller (including `AnalyticsService`) can iterate, mutate, or read it concurrently with the `synchronized` write methods, breaking all synchronization guarantees. The `@Getter`-generated accessor is unprotected.

**Fix:** remove the `@Getter` annotation; add a manual `public synchronized List<WeatherRecord> getMetricsWindow()` that returns `List.copyOf(metricsWindow)`.

---

### 3. `loadCacheSnapshot` seeds the spike window with the *oldest* records / done
**File:** `SensorStateCache.java:113`

```java
dtos.subList(0, dtos.size() - SPIKE_REFERENCE_SIZE).forEach(this::addSpikes);
```

This adds every record **except the last five** to the spike window. Since the window cap is 5, it fills up with old readings and then the most recent five are discarded. The window should be seeded with the most recent values.

**Fix:**
```java
if (dtos.size() >= SPIKE_REFERENCE_SIZE) {
    dtos.subList(dtos.size() - SPIKE_REFERENCE_SIZE, dtos.size()).forEach(this::addSpikes);
} else {
    dtos.forEach(this::addSpikes);
}
```

---

### 4. `getSurfaceWetness` throws `NoSuchElementException` on empty window
**File:** `AnalyticsService.java:141`

```java
long rawAdc = sensorStateCache.getMetricsWindow().getLast().getSurfaceWetness();
```

`getLast()` throws if the deque is empty. All other metric getters guard through the cache state (`lastSavedMeasurement` null-check in `DashboardService`), but this path in `getSurfaceWetness` has no guard. If the dashboard is loaded before the first reading arrives, this will throw a 500.

**Fix:** return a safe default (or `null`) when the window is empty, consistent with the other metric getters.

---

### 5. Hardcoded credentials in `SecurityConfig`
**File:** `SecurityConfig.java:57`

```java
.password(passwordEncoder.encode("1234"))
```

The admin password is hardcoded as `"1234"` in source and committed to the repository. Credentials must come from environment variables or an external secrets store.

**Fix:** bind `admin.username` and `admin.password` through `@ConfigurationProperties` or `@Value`, sourced from environment variables. Never commit `application-local.yml` with the DB password either (line 5 of that file has a real password).

---

## Medium

### 6. `ConfigController` returns raw JPA entities
**File:** `ConfigController.java:27, 33, 39`

All three PUT endpoints return `ResponseEntity<StationConfiguration>` — the JPA entity. This leaks persistence internals (column names, Hibernate proxies) and ties the API contract to the DB schema. The `StationConfigurationResponse` DTO already exists for reads; the same pattern should apply to writes.

**Fix:** return the existing `StationConfigurationResponse` DTO (or a purpose-built response record) from all update endpoints.

---

### 7. `getLatestWeatherRecord` returns `null` with `200 OK`
**File:** `WeatherController.java:35`

```java
return ResponseEntity.ok(service.getLatestTodayWeatherRecord().orElse(null));
```

When no record exists today, this serialises as a `200 OK` with a JSON `null` body. The correct semantics are `204 No Content` or `404 Not Found`.

**Fix:**
```java
return service.getLatestTodayWeatherRecord()
    .map(ResponseEntity::ok)
    .orElse(ResponseEntity.noContent().build());
```

---

### 8. `persistAndRefreshCache` publishes the pre-save entity
**File:** `StationConfigurationService.java:87`

```java
StationConfiguration savedCfg = stationConfigurationRepository.save(cfg);
eventPublisher.publishEvent(new ConfigurationUpdatedEvent(cfg)); // cfg, not savedCfg
```

The event carries the original `cfg` object. If `save` triggers any JPA lifecycle callback that modifies the entity (e.g., a version/audit field), `ConfigurationCache` will be populated with stale data. The saved instance `savedCfg` should be used.

---

### 9. `ConfigurationCache.apply()` performs three separate volatile writes
**File:** `ConfigurationCache.java:23-25`

```java
locationContext = mapper.toLocationContext(cfg);
validationConfig = mapper.toValidationConfig(cfg);
hardwareConfig = mapper.toHardwareConfig(cfg);
```

A thread reading between two of these writes sees a mixed state (e.g., new location, old validation thresholds). For a weather station this is low-risk, but a spike arriving at exactly that moment could be validated with mismatched config.

**Fix:** introduce a single immutable value object (`StationState`) holding all three sub-configs, and update with one `volatile` write.

---

### 10. Mixed `@Transactional` annotations
**File:** `StationConfigurationService.java:35, 46, 71`

Uses `jakarta.transaction.Transactional`, while the rest of the codebase uses `org.springframework.transaction.annotation.Transactional`. While Spring supports both, they differ in propagation defaults and rollback semantics (Jakarta's only rolls back on `RuntimeException` by default; Spring's matches that but the intent is clearer). Mixing creates confusion.

**Fix:** standardise on `org.springframework.transaction.annotation.Transactional` throughout.

---

### 11. `resolution` chart parameter typed as `String`
**File:** `WeatherController.java:58`, `AnalyticsService.java:158`

```java
@RequestParam(value = "resolution", defaultValue = "10") String resolution
```

`resolution` is immediately used in `Integer.parseInt(resolution)` and string-concatenated into a SQL interval (`resolution + "minutes"`). An invalid value produces an uncontrolled `NumberFormatException` from deep inside the service layer. Typing it as `int` in the controller gives Spring's type-conversion layer the chance to return a proper 400.

**Fix:** change to `@RequestParam(defaultValue = "10") int resolution` and propagate the type change through `returnChart` and `getMetricChart`.

---

### 12. MQTT resubscription never fires
**File:** `MqttConsumer.java:143-148`

When the broker reconnects (`reconnect=true`), `resubscribe()` calls `subscribe("weather/bmp180")`, which checks `subscribedTopics.add(topic)`. Because the topic was already added during initial setup, `add` returns `false` and the method exits immediately — `client.subscribe(...)` is never called again. With `cleanSession = false` the broker restores the subscription automatically, so this works by accident, but the intent is broken and the code is misleading.

**Fix:** either remove `resubscribe()` entirely (rely on `cleanSession = false`) and document the reason, or clear `subscribedTopics` on disconnect so the re-add path works correctly.

---

### 13. `findLastRecordTime` returns `null` instead of `Optional`
**File:** `AnalyticsService.java:48-57`

Returning `null` from a public service method forces callers to null-check. The rest of the service already uses `Optional` where absence is possible (e.g., `getLatestTodayWeatherRecord`).

**Fix:** `public Optional<ZonedDateTime> findLastRecordTime()` and update the call site in `DashboardService`.

---

### 14. `getDayDuration` recomputes expensive astronomy searches
**File:** `AstronomySearch.java:221-226`

`getSunDailyEvents()` already calls `engine.findWhenAtAltitude` for sunrise and sunset, but `getDayDuration()` (called from the same method) calls them again as separate library operations. Each call iterates a time search. The results from `getSunTimesDto()` (sunrise, sunset) should be reused.

---

### 15. CSRF fully disabled
**File:** `SecurityConfig.java:24`

`AbstractHttpConfigurer::disable` turns off CSRF for all paths, including the form-login admin pages. API-only paths that are stateless and use token-based auth are fine without CSRF, but browser-facing form endpoints (config admin) are vulnerable to cross-site request forgery.

**Fix:** use `CsrfTokenRepository` and enable CSRF for the `/admin/**` paths; disable it only for the stateless REST endpoints under `/api/**`.

---

### 16. No `@Valid` on the ingest POST endpoint
**File:** `WeatherController.java:40`

```java
public ResponseEntity<WeatherRecordResponseDto> createNewWeatherRecord(
    @RequestBody WeatherRecordCreatedDto dto)
```

No `@Valid` annotation. If Bean Validation constraints are ever added to `WeatherRecordCreatedDto`, they will be silently ignored. The existing data-quality validator inside the service is a domain check, not a format check.

**Fix:** add `@Valid` to the `@RequestBody` parameter.

---

### 17. `DatabaseRawViewService.deleteRecord` has a TOCTOU race
**File:** `DatabaseRawViewService.java:87-93`

```java
if (repository.existsById(id)) {
    repository.deleteById(id);
    return true;
}
```

Two concurrent requests could both pass the `existsById` check before either deletes. The method also lacks `@Transactional`, so no isolation is guaranteed.

**Fix:** add `@Transactional` and replace the check-then-act with a direct `deleteById` (catching or ignoring the case where the entity is already gone), or use a custom `@Query DELETE ... WHERE id = :id` and check the affected row count.

---

## Low / Code Quality

### 18. `MeteoMath.medianOf` is dead code
**File:** `MeteoMath.java:94-97`

```java
private static Double medianOf(Deque<Double> spikeWindow) { ... }
```

This private method is never called anywhere. Delete it.

---

### 19. `WeatherRecordCreatedDto.WIFI_RSSI` violates Java naming conventions
**File:** `WeatherRecordCreatedDto.java:22`

`WIFI_RSSI` uses `SCREAMING_SNAKE_CASE`, the convention for constants. Jackson will serialize it as `"WIFI_RSSI"` by default (or `"wifi_rssi"` depending on `MapperFeature.USE_STD_BEAN_NAMING`), which is inconsistent with every other field in the DTO.

**Fix:** rename to `wifiRssi` and add `@JsonProperty("WIFI_RSSI")` if the MQTT payload key must remain uppercase.

---

### 20. `validateIfOk` has convoluted early-return logic
**File:** `WeatherService.java:38-47`

```java
if (quality.equals(DataQuality.OK) && sensorStateCache.getLastSavedMeasurement() == null) {
    return DataQuality.OK;
}
return quality == DataQuality.OK ? validateMetric(metric, validationResult, value) : quality;
```

The intent — "skip spike check when there's no reference reading yet" — is split across two branches. The first branch is a subset of the second; merging them makes the logic obvious:

```java
if (quality != DataQuality.OK) return quality;
if (sensorStateCache.getLastSavedMeasurement() == null) return DataQuality.OK;
return validateMetric(metric, validationResult, value);
```

---

### 21. Duplicate spike-window management logic
**File:** `SensorStateCache.java:144-150` vs `186-193`

`updateCachedMeasurement` (public) and `updateSpikeReferenceWindow` (private) contain identical body. One should call the other.

---

### 22. Noisy `log.info` inside spike counter
**File:** `SensorStateCache.java:201`

```java
log.info("spikes {}", spikes);
```

A bare `"spikes N"` message at INFO level with no context (no metric name, no timestamp) adds clutter. This looks like leftover debug output.

**Fix:** either remove it or demote to `DEBUG` with context: `log.debug("[SPIKE_COUNTER][{}] consecutive={}", metric, spikes)`.

---

### 23. Hardcoded MQTT topic string appears twice
**File:** `MqttConsumer.java:139, 144`

`"weather/bmp180"` is repeated in `subscribeInitialTopics()` and `resubscribe()`. Extract to a private constant or read it from `MqttProperties`.

---

### 24. `AstronomyEngine.toZoned` uses a fully-qualified class name
**File:** `AstronomyEngine.java:197`

```java
return com.flather.weatherstation.util.TimeUtil.toZoned(time, zoneId());
```

The fully-qualified name suggests there was a name collision with an import that was later removed. A static import of `TimeUtil.toZoned` is cleaner.

---

### 25. `getMoonPhaseName` in `AstroUtil` is a dead alias
**File:** `AstroUtil.java:46-48`

```java
public static String getMoonPhaseName(double phaseDegrees) {
    return getPhaseName(phaseDegrees);
}
```

`getMoonPhaseName` is never called; `AstronomySearch` calls `getPhaseName` directly. Remove the alias.

---

### 26. `SensorCacheInitializer` calls `.stream().toList()` on an already-`List`
**File:** `SensorCacheInitializer.java:32-35`

```java
repository.findByMeasuredAtAfterOrderByMeasuredAtAsc(...)
    .stream()
    .toList();
```

`findByMeasuredAtAfterOrderByMeasuredAtAsc` already returns `List<WeatherRecord>`. The `.stream().toList()` copy is redundant.

---

### 27. `WeatherRecord.measuredAt` is the persist time, not the sensor measurement time
**File:** `WeatherRecord.java:51-53`

```java
@CreationTimestamp
@Column(name = "measured_at")
private Instant measuredAt;
```

`@CreationTimestamp` records the DB insert time. If there is any MQTT lag, reconnection delay, or processing queue, the stored timestamp does not represent when the sensor actually sampled the environment. The `WeatherRecordCreatedDto` should carry the sensor's own timestamp and the entity should store that value instead.

---

## Summary Table

| # | Severity | File | Issue |
|---|----------|------|-------|
| 1 | Critical | `WeatherService` | Spike window mutated before DB commit |
| 2 | Critical | `SensorStateCache` | `metricsWindow` exposed as mutable deque |
| 3 | Critical | `SensorStateCache` | Spike window seeded with oldest, not newest, records |
| 4 | Critical | `AnalyticsService` | `getSurfaceWetness` crashes on empty window |
| 5 | Critical | `SecurityConfig` / `application-local.yml` | Hardcoded credentials |
| 6 | Medium | `ConfigController` | Returns raw JPA entity |
| 7 | Medium | `WeatherController` | Null body on 200 OK |
| 8 | Medium | `StationConfigurationService` | Event carries pre-save entity |
| 9 | Medium | `ConfigurationCache` | Non-atomic triple volatile write |
| 10 | Medium | `StationConfigurationService` | Mixed `@Transactional` namespaces |
| 11 | Medium | `WeatherController` / `AnalyticsService` | `resolution` typed as `String` |
| 12 | Medium | `MqttConsumer` | Resubscription silently skipped |
| 13 | Medium | `AnalyticsService` | `null` returned instead of `Optional` |
| 14 | Medium | `AstronomySearch` | Redundant astronomy search in `getDayDuration` |
| 15 | Medium | `SecurityConfig` | CSRF fully disabled |
| 16 | Medium | `WeatherController` | Missing `@Valid` on ingest endpoint |
| 17 | Medium | `DatabaseRawViewService` | TOCTOU race + missing `@Transactional` on delete |
| 18 | Low | `MeteoMath` | Dead private method `medianOf` |
| 19 | Low | `WeatherRecordCreatedDto` | `WIFI_RSSI` naming violates conventions |
| 20 | Low | `WeatherService` | Convoluted early-return in `validateIfOk` |
| 21 | Low | `SensorStateCache` | Duplicated spike-window management code |
| 22 | Low | `SensorStateCache` | Noisy bare `log.info("spikes {}", spikes)` |
| 23 | Low | `MqttConsumer` | Hardcoded topic string duplicated |
| 24 | Low | `AstronomyEngine` | Fully-qualified call instead of static import |
| 25 | Low | `AstroUtil` | Dead `getMoonPhaseName` alias |
| 26 | Low | `SensorCacheInitializer` | Redundant `.stream().toList()` on existing `List` |
| 27 | Low | `WeatherRecord` | `@CreationTimestamp` records persist time, not sensor time |
