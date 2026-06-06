CREATE TABLE weather_records (
                                 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

                                 device_id VARCHAR(50) NOT NULL,

                                 temperature DOUBLE PRECISION,
                                 pressure DOUBLE PRECISION,
                                 humidity DOUBLE PRECISION,

                                 temperature_data_quality VARCHAR(25),
                                 pressure_data_quality VARCHAR(25),
                                 humidity_data_quality VARCHAR(25),

                                 measured_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_weather_temp_quality_time
    ON weather_records (temperature_data_quality, measured_at DESC);

CREATE INDEX idx_weather_pressure_quality_time
    ON weather_records (pressure_data_quality, measured_at DESC);

CREATE INDEX idx_weather_humidity_quality_time
    ON weather_records (humidity_data_quality, measured_at DESC);