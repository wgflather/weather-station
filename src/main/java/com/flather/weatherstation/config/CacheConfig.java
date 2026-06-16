package com.flather.weatherstation.config;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.time.Duration;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Application cache definitions. Each cache is bounded so that timezone changes or day rollovers
 * naturally evict obsolete entries — there is no scheduled invalidation job.
 *
 * <p>The {@code sunDailyEvents} and {@code moonDailyEvents} caches are keyed by "{@code
 * LocalDate@ZoneId}" (see {@code AstronomySearch#dailyKey()}), so each unique (date, zone) pair
 * gets its own slot. {@code maximumSize(4)} leaves room for:
 *
 * <ul>
 *   <li>today's entry,
 *   <li>yesterday's entry briefly across a midnight transition,
 *   <li>an old-zone entry briefly after a runtime configuration change.
 * </ul>
 *
 * {@code expireAfterWrite} is a safety net so nothing lingers indefinitely.
 */
@Configuration
@EnableCaching
public class CacheConfig {

  @Bean
  public CacheManager cacheManager() {
    CaffeineCacheManager cacheManager = new CaffeineCacheManager();

    cacheManager.registerCustomCache("sunDailyEvents", dailyEventsCache());
    cacheManager.registerCustomCache("moonDailyEvents", dailyEventsCache());
    cacheManager.registerCustomCache("apiWeather", apiWeatherCache());

    return cacheManager;
  }

  private static com.github.benmanes.caffeine.cache.Cache<Object, Object> dailyEventsCache() {
    return Caffeine.newBuilder()
        .maximumSize(4)
        .expireAfterWrite(Duration.ofHours(48))
        .recordStats()
        .build();
  }

  private static Cache<Object, Object> apiWeatherCache() {
    return Caffeine.newBuilder()
        .maximumSize(1)
        .expireAfterWrite(Duration.ofMinutes(20))
        .recordStats()
        .build();
  }
}
