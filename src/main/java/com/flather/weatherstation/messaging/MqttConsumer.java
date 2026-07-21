package com.flather.weatherstation.messaging;

import com.flather.weatherstation.cache.SensorStateCache;
import com.flather.weatherstation.config.MqttProperties;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import com.flather.weatherstation.service.WeatherService;
import java.util.HashSet;
import java.util.Set;
import javax.net.ssl.SSLSocketFactory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken;
import org.eclipse.paho.client.mqttv3.MqttCallbackExtended;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
@ConditionalOnProperty(name = "mqtt.enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
public class MqttConsumer {

  private MqttClient client;
  private final WeatherService service;
  private final ObjectMapper mapper;
  private final MqttProperties properties;
  private final SensorStateCache cache;
  private final Set<String> subscribedTopics = new HashSet<>();

  private static final int MAX_RETRIES = 5;
  private static final long BASE_DELAY_MS = 2000L;
  private static final long NO_CONNECTION_RETRY_MS = 30000L;

  @EventListener(ApplicationReadyEvent.class)
  public void initConnection() {
    connectWithRetry();
  }

  // ---------------- CONNECTION ----------------

  private void connectWithRetry() {
    for (int attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        connect();
        return;
      } catch (Exception e) {
        log.warn("MQTT connection attempt {} failed", attempt, e);

        if (attempt == MAX_RETRIES) {
          boolean isConnected = false;
          while (!isConnected && !Thread.currentThread().isInterrupted()) {
            try {
              connect();
              isConnected = true;
            } catch (Exception a) {
              log.warn("No MQTT connection", a);
              sleep(NO_CONNECTION_RETRY_MS);
            }
          }
          return;
        }
        sleep(backoffDelay(attempt));
      }
    }
  }

  private void connect() throws MqttException {
    if (client != null && client.isConnected()) {
      log.debug("MQTT already connected");
      return;
    }

    String hostUri =
        properties.getProtocol() + "://" + properties.getHost() + ":" + properties.getPort();

    client = new MqttClient(hostUri, properties.getClientId(), new MemoryPersistence());

    client.setCallback(buildCallback());

    client.connect(buildOptions());

    log.info("Connected to MQTT broker: {}", properties.getHost());

    subscribeInitialTopics();
  }

  // ---------------- CALLBACK ----------------

  private MqttCallbackExtended buildCallback() {
    return new MqttCallbackExtended() {

      @Override
      public void connectComplete(boolean reconnect, String serverURI) {
        log.info("MQTT connected. reconnect={}, uri={}", reconnect, serverURI);
        cache.setMqttConnected(true);

        if (reconnect) {
          resubscribe();
        }
      }

      @Override
      public void connectionLost(Throwable cause) {
        log.warn("MQTT connection lost", cause);
        cache.setMqttConnected(false);
      }

      @Override
      public void messageArrived(String topic, MqttMessage message) {
        handleMessage(topic, message);
      }

      @Override
      public void deliveryComplete(IMqttDeliveryToken token) {
        // no-op
      }
    };
  }

  // ---------------- MESSAGE HANDLING ----------------

  void handleMessage(String topic, MqttMessage message) {
    try {
      String normalizedTopic = normalizeTopic(topic);

      WeatherRecordCreatedDto dto =
          mapper.readValue(message.getPayload(), WeatherRecordCreatedDto.class);

      WeatherRecordResponseDto savedDto = service.saveWeatherRecord(dto);

      log.info("Saved record from [{}]: {}", normalizedTopic, savedDto);
      log.info("{}", dto);

    } catch (Exception e) {
      log.error("Failed to process MQTT message topic={}", topic, e);
    }
  }

  // ---------------- SUBSCRIPTIONS ----------------

  private void subscribeInitialTopics() throws MqttException {
    subscribe(properties.getTopic());
  }

  private void resubscribe() {
    for (String topic : subscribedTopics) {
      try {
        client.subscribe(topic, 1);
        log.info("Resubscribed to {}", topic);
      } catch (MqttException e) {
        log.warn("Resubscribe failed for topic {}", topic, e);
      }
    }
  }

  private void subscribe(String topic) throws MqttException {
    if (!subscribedTopics.add(topic)) {
      return;
    }

    client.subscribe(topic, 1);
    log.info("Subscribed to {}", topic);
  }

  // ---------------- OPTIONS ----------------

  private MqttConnectOptions buildOptions() {
    MqttConnectOptions options = new MqttConnectOptions();

    options.setAutomaticReconnect(true);
    options.setCleanSession(false);
    options.setConnectionTimeout(30);
    options.setKeepAliveInterval(60);

    if (properties.getUsername() != null && !properties.getUsername().isBlank()) {
      options.setUserName(properties.getUsername());
      options.setPassword(properties.getPassword().toCharArray());
    }

    if ("ssl".equals(properties.getProtocol())) {
      options.setSocketFactory(SSLSocketFactory.getDefault());
    }

    return options;
  }

  // ---------------- UTIL ----------------

  private void sleep(long ms) {
    try {
      Thread.sleep(ms);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
    }
  }

  private long backoffDelay(int attempt) {
    return BASE_DELAY_MS * (1L << (attempt - 1));
  }

  private static String normalizeTopic(String topic) {
    return topic.replace("/#", "").replace("/+", "");
  }
}
