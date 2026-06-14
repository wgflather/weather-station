package com.flather.weatherstation;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class WeatherStationApplication {

  // TODO: Sun altitude <= (minimum altitude + 2°)

  public static void main(String[] args) {
    SpringApplication.run(WeatherStationApplication.class, args);
  }
}
