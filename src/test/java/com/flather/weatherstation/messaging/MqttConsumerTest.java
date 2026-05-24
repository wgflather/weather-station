package com.flather.weatherstation.messaging;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.Mockito.*;

import com.flather.weatherstation.config.MqttProperties;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.service.WeatherService;
import java.time.Instant;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.databind.ObjectMapper;

@ExtendWith(MockitoExtension.class)
class MqttConsumerTest {
  private final ObjectMapper objectMapper = new ObjectMapper();

  @Mock private WeatherService service;

  private MqttConsumer consumer;

  @Mock private MqttClient client;

  @Mock private MqttProperties properties;

  @BeforeEach
  void setup() {
    consumer = new MqttConsumer(service, objectMapper, properties);
  }

  @Test
  void shouldSaveWeatherMessage_whenMessageIsValid() throws Exception {
    Instant staticTime = Instant.parse("2026-05-20T12:00:00Z");
    WeatherRecordCreatedDto mockDto =
        WeatherRecordCreatedDto.builder()
            .temperature(20)
            .measuredAt(staticTime)
            .pressure(1000)
            .build();

    byte[] payload = objectMapper.writeValueAsBytes(mockDto);
    MqttMessage message = new MqttMessage(payload);

    consumer.handleMessage("weather/bmp180", message);

    verify(service).saveWeatherRecord(mockDto);
  }

  @Test
  void shouldNotThrowException_whenPayloadIsMalformed() throws Exception {
    MqttMessage message = new MqttMessage("not valid json payload".getBytes());

    consumer.handleMessage("weather/bmp180", message);

    assertDoesNotThrow(() -> consumer.handleMessage("weather/bmp180", message));
  }

  @Test
  void shouldNotCallService_whenPayloadIsMalformed() throws Exception {
    MqttMessage message = new MqttMessage("not valid json payload".getBytes());

    consumer.handleMessage("weather/bmp180", message);

    verifyNoInteractions(service);
  }
}
