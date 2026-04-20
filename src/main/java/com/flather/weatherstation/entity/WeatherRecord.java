package com.flather.weatherstation.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotNull;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

@Entity
@Table(name = "weather_records")
@AllArgsConstructor
@Builder
@NoArgsConstructor
@Getter
@Setter
public class WeatherRecord {
    @Id
    @GeneratedValue
    private Long id;

    private double temperature;

    private double pressure;

    @NotNull
    private Instant measuredAt;

    @CreationTimestamp
    private Instant savedAt;
}
