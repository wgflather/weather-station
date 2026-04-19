package com.flather.weatherstation;

import org.springframework.boot.SpringApplication;

public class TestWeatherStationApplication {

    public static void main(String[] args) {
        SpringApplication.from(WeatherStationApplication::main).with(TestcontainersConfiguration.class).run(args);
    }

}
