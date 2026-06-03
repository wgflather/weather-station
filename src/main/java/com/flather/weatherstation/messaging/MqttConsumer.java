package com.flather.weatherstation.messaging;

import com.flather.weatherstation.config.MqttProperties;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.dto.weather.WeatherRecordResponseDto;
import com.flather.weatherstation.exception.DataQualityFailureException;
import com.flather.weatherstation.service.WeatherService;
import java.util.HashSet;
import java.util.Set;
import javax.net.ssl.SSLSocketFactory;

import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken;
import org.eclipse.paho.client.mqttv3.MqttCallbackExtended;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Bean;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
@RequiredArgsConstructor
public class MqttConsumer {

  private MqttClient client;
  private final WeatherService service;
  private final ObjectMapper mapper;
  private final MqttProperties properties;
  private final Set<String> subscribedTopics = new HashSet<>();

  private static final int MAX_RETRIES = 5;
  private static final long BASE_DELAY_MS = 2000L;

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
          throw new RuntimeException("MQTT connection failed after retries", e);
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

        if (reconnect) {
          resubscribe();
        }
      }

      @Override
      public void connectionLost(Throwable cause) {
        log.warn("MQTT connection lost", cause);
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

    } catch (DataQualityFailureException e) {
      log.warn("Rejected record: {}", e.getMessage());

    } catch (Exception e) {
      log.error("Failed to process MQTT message topic={}", topic, e);
    }
  }

  // ---------------- SUBSCRIPTIONS ----------------

  private void subscribeInitialTopics() throws MqttException {
    subscribe("weather/bmp180");
  }

  private void resubscribe() {
    try {
      subscribe("weather/bmp180");
    } catch (MqttException e) {
      log.warn("Resubscribe failed", e);
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

    if ("ssl".equals(properties.getProtocol())) {
      options.setSocketFactory(SSLSocketFactory.getDefault());
      options.setUserName(properties.getUsername());
      options.setPassword(properties.getPassword().toCharArray());
    }

    return options;
  }

  // ---------------- UTIL ----------------

  private void sleep(long ms) {
    try {
      Thread.sleep(ms);
    } catch (InterruptedException ignored) {
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
