package com.flather.weatherstation.controller;

import com.flather.weatherstation.model.dto.WeatherRecordCreatedDto;
import com.flather.weatherstation.service.WeatherService;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

@Slf4j
@Component
public class MqttConsumer {
    private final WeatherService service;
    private final ObjectMapper mapper;
    public MqttConsumer(WeatherService service, ObjectMapper mapper){
        this.service = service;
        this.mapper = mapper;
        connect();
    }
    String broker = "tcp://192.168.0.69:1883";
    String clientId = "spring-client";

    private void connect(){
        try(MqttClient client = new MqttClient(broker, clientId)){

            client.connect();

            log.info("Connected to MQTT broker {}", broker);

            client.subscribe("/weather/bmp180", (topic, mqttMessage) -> {
                String payload = new String(mqttMessage.getPayload());
                WeatherRecordCreatedDto savedRecord = mapper.readValue(payload, WeatherRecordCreatedDto.class);
                service.saveWeatherRecord(savedRecord);
                log.info("Saved a new weather record: {}", savedRecord);
            });

        } catch (Exception e){
            log.warn("{}", e.getMessage());
        }
    }
}
