package com.flather.weatherstation.entity;

import jakarta.persistence.*;
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
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private double temperature;

    private double pressure;

    @NotNull
    @Column(name = "measured_at")
    private Instant measuredAt;

    @CreationTimestamp
    @Column(name = "saved_at")
    private Instant savedAt;
}
