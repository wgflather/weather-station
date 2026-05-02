package com.flather.weatherstation.controller;

import com.flather.weatherstation.config.MqttProperties;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.service.WeatherService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
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


    private void connect(){
        try{
            MemoryPersistence persistence = new MemoryPersistence();
            client = new MqttClient(properties.getHost(), properties.getClientId(), persistence);

            MqttConnectOptions options = new MqttConnectOptions();
            options.setAutomaticReconnect(true);
            options.setCleanSession(false);

            client.connect(options);

            log.info("Connected to MQTT broker {}", properties.getHost());

            client.subscribe("/weather/bmp180", 1,(topic, mqttMessage) -> {
                String payload = new String(mqttMessage.getPayload());
                try {
                    WeatherRecordCreatedDto savedRecord = mapper.readValue(payload,
                            WeatherRecordCreatedDto.class);
                    service.saveWeatherRecord(savedRecord);
                    log.info("Saved a new weather record: {}", savedRecord);
                }catch (Exception e){
                    log.warn("MQTT response paring Error: ", e);
                }

            });

        } catch (Exception e){
            log.warn("MQTT connection error: ", e);
        }
    }

    @PostConstruct
    void initConnection(){
        connect();
    }
}
