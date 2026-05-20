package com.flather.weatherstation.messaging;

import com.fasterxml.jackson.databind.SerializationFeature;
import com.flather.weatherstation.config.MqttProperties;
import com.flather.weatherstation.controller.WeatherController;
import com.flather.weatherstation.dto.weather.WeatherRecordCreatedDto;
import com.flather.weatherstation.mapper.WeatherRecordMapper;
import com.flather.weatherstation.service.WeatherService;
import org.eclipse.paho.client.mqttv3.IMqttClient;
import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttException;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.integration.mqtt.core.MqttPahoClientFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.ObjectMapper;

import java.time.Instant;


import static org.hamcrest.MatcherAssert.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;


@ExtendWith(MockitoExtension.class)
class MqttConsumerTest {
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Mock
    private WeatherService service;

    private MqttConsumer consumer;

    @Mock
    private MqttClient client;

    @Mock
    private MqttProperties properties;



    @BeforeEach
    void setup(){
        consumer = new MqttConsumer(service, objectMapper, properties);
    }

    @Test
    void shouldSaveWeatherMessage_whenMessageIsValid() throws Exception{
        Instant staticTime = Instant.parse("2026-05-20T12:00:00Z");
        WeatherRecordCreatedDto mockDto = WeatherRecordCreatedDto.builder()
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
    void shouldNotThrowException_whenPayloadIsMalformed() throws Exception{
        MqttMessage message = new MqttMessage("not valid json payload".getBytes());

        consumer.handleMessage("weather/bmp180", message);

        assertDoesNotThrow(() -> consumer.handleMessage("weather/bmp180", message));
    }

    @Test
    void shouldNotCallService_whenPayloadIsMalformed() throws Exception{
        MqttMessage message = new MqttMessage("not valid json payload".getBytes());

        consumer.handleMessage("weather/bmp180", message);

        verifyNoInteractions(service);
    }



}