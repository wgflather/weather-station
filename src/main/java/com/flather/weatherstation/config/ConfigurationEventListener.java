package com.flather.weatherstation.config;

import com.flather.weatherstation.cache.ConfigurationCache;
import com.flather.weatherstation.dto.configuration.ConfigurationUpdatedEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ConfigurationEventListener {
  private final ConfigurationCache configurationCache;

  @EventListener
  public void onUpdated(ConfigurationUpdatedEvent updatedEvent) {
    configurationCache.apply(updatedEvent.configuration());
  }
}
