package com.flather.weatherstation.controller;

import com.flather.weatherstation.config.MqttProperties;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.service.WeatherService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.MqttCallbackExtended;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
@RequiredArgsConstructor
public class MqttConsumer {
    private final WeatherService service;
    private final ObjectMapper mapper;
    private final MqttProperties properties;

    private MqttClient client;

    @EventListener(ApplicationReadyEvent.class)
    void initConnection() {
        connect();
    }

    private void connect() {
        // Prevent multiple connection attempts
        if (client != null && client.isConnected()) {
            log.info("MQTT Client is already connected.");
            return;
        }

        try {
            MemoryPersistence persistence = new MemoryPersistence();
            client = new MqttClient(properties.getHost(), properties.getClientId(), persistence);

            MqttConnectOptions options = new MqttConnectOptions();
            options.setAutomaticReconnect(true);
            options.setCleanSession(false);
            options.setConnectionTimeout(10); // Short timeout for initial connection

            // Add callback for connection lost events
            client.setCallback(new MqttCallbackExtended() {
                @Override
                public void connectComplete(boolean reconnect, String serverURI) {
                    log.info("MQTT Connection completed. Reconnect: {}", reconnect);
                    if (reconnect) {
                        log.info("Reconnected to MQTT broker {}", properties.getHost());
                    }
                    // Re-subscribe if necessary (Paho handles this for cleanSession=false usually, but explicit is safer)
                }

                @Override
                public void connectionLost(Throwable cause) {
                    log.error("MQTT connection lost. Attempting to reconnect...", cause);
                }

                @Override
                public void messageArrived(String topic, MqttMessage message) {
                    String payload = new String(message.getPayload());
                    try {
                        WeatherRecordCreatedDto savedRecord = mapper.readValue(payload,
                                WeatherRecordCreatedDto.class);
                        service.saveWeatherRecord(savedRecord);
                        log.info("Saved a new weather record: {}", savedRecord);
                    } catch (Exception e) {
                        log.warn("MQTT response parsing Error: ", e);
                    }
                }

                @Override
                public void deliveryComplete(org.eclipse.paho.client.mqttv3.IMqttDeliveryToken token) {
                    // Not used for this consumer
                }
            });

            client.connect(options);
            log.info("Connected to MQTT broker {}", properties.getHost());

        } catch (Exception e) {
            log.error("MQTT connection error. Retrying connection...", e);
            // The automatic reconnect logic in options will handle subsequent attempts
            // if the client object is kept alive.
        }
    }
}
