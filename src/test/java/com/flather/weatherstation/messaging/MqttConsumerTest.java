package com.flather.weatherstation.messaging;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.Mockito.*;

import com.flather.weatherstation.cache.SensorStateCache;
import com.flather.weatherstation.config.EmptyStringToNaNDoubleDeserializer;
import com.flather.weatherstation.config.MqttProperties;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.service.WeatherService;
import java.nio.charset.StandardCharsets;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.openapitools.jackson.nullable.JsonNullable;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.ValueDeserializer;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.module.SimpleModule;

@ExtendWith(MockitoExtension.class)
class MqttConsumerTest {

  /**
   * Mirrors what {@code @JacksonComponent} wires up in the running app — without the metric
   * deserializer registered, {@link JsonNullable} fields deserialize as plain beans and none of the
   * absent/null/value distinctions hold.
   */
  private final ObjectMapper objectMapper = mapperWithMetricDeserializer();

  @SuppressWarnings({"unchecked", "rawtypes"})
  private static ObjectMapper mapperWithMetricDeserializer() {
    SimpleModule module = new SimpleModule("json-nullable-metrics");
    module.addDeserializer(
        JsonNullable.class, (ValueDeserializer) new EmptyStringToNaNDoubleDeserializer());
    return JsonMapper.builder().addModule(module).build();
  }

  @Mock private WeatherService service;

  private MqttConsumer consumer;

  @Mock private MqttClient client;

  @Mock private MqttProperties properties;

  @Mock private SensorStateCache sensorStateCache;

  @BeforeEach
  void setup() {
    consumer = new MqttConsumer(service, objectMapper, properties, sensorStateCache);
  }

  @Test
  void shouldSaveWeatherMessage_whenMessageIsValid() {
    // A raw payload rather than a serialized DTO: this is the byte stream firmware actually
    // publishes, and it is the only way the absent-field case reaches the deserializer.
    MqttMessage message =
        message(
            """
            {"deviceId":"device-1","temperature":20.0,"pressure":1000.0,"WIFI_RSSI":-60.0}
            """);

    consumer.handleMessage("weather/bmp180", message);

    WeatherRecordCreatedDto expected =
        WeatherRecordCreatedDto.builder()
            .deviceId("device-1")
            .temperature(JsonNullable.of(20.0))
            .pressure(JsonNullable.of(1000.0))
            .humidity(JsonNullable.undefined())
            .surfaceWetness(JsonNullable.undefined())
            .wind(JsonNullable.undefined())
            .windDirection(JsonNullable.undefined())
            .uvIndex(JsonNullable.undefined())
            .wifiRssi(-60.0)
            .build();

    verify(service).saveWeatherRecord(expected);
  }

  @Test
  void shouldSaveRemainingMetrics_whenOneFieldIsUnparseable() {
    MqttMessage message =
        message(
            """
            {"deviceId":"device-1","temperature":"n/a","pressure":1000.0,"WIFI_RSSI":-60.0}
            """);

    consumer.handleMessage("weather/bmp180", message);

    // The bad field degrades to NaN on its own; the reading is not discarded.
    WeatherRecordCreatedDto expected =
        WeatherRecordCreatedDto.builder()
            .deviceId("device-1")
            .temperature(JsonNullable.of(Double.NaN))
            .pressure(JsonNullable.of(1000.0))
            .humidity(JsonNullable.undefined())
            .surfaceWetness(JsonNullable.undefined())
            .wind(JsonNullable.undefined())
            .windDirection(JsonNullable.undefined())
            .uvIndex(JsonNullable.undefined())
            .wifiRssi(-60.0)
            .build();

    verify(service).saveWeatherRecord(expected);
  }

  private static MqttMessage message(String payload) {
    return new MqttMessage(payload.getBytes(StandardCharsets.UTF_8));
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
