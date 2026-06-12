CREATE TABLE station_configuration (
                                       id BIGINT PRIMARY KEY,

    -- Location
                                       latitude DOUBLE PRECISION NOT NULL,
                                       longitude DOUBLE PRECISION NOT NULL,
                                       elevation DOUBLE PRECISION NOT NULL DEFAULT 0,

    -- Hardware
                                       board VARCHAR(100) NOT NULL,
                                       temperature_sensor VARCHAR(100) NOT NULL,
                                       humidity_sensor VARCHAR(100) NOT NULL,
                                       pressure_sensor VARCHAR(100) NOT NULL,
                                       surface_wetness_sensor VARCHAR(100) NOT NULL,

    -- Validation thresholds
                                       temp_minimal DOUBLE PRECISION NOT NULL,
                                       temp_maximum DOUBLE PRECISION NOT NULL,

                                       pressure_minimal DOUBLE PRECISION NOT NULL,
                                       pressure_maximum DOUBLE PRECISION NOT NULL,

                                       humidity_minimal DOUBLE PRECISION NOT NULL,
                                       humidity_maximum DOUBLE PRECISION NOT NULL,

                                       humidity_spike_limit DOUBLE PRECISION NOT NULL,
                                       temp_spike_limit DOUBLE PRECISION NOT NULL,
                                       pressure_spike_limit DOUBLE PRECISION NOT NULL,

                                       surface_wetness_wet_baseline INTEGER NOT NULL,
                                       surface_wetness_dry_baseline INTEGER NOT NULL,

                                       created_at TIMESTAMP NOT NULL,
                                       updated_at TIMESTAMP NOT NULL
);

INSERT INTO station_configuration (
    id,
    latitude,
    longitude,
    elevation,
    board,
    temperature_sensor,
    humidity_sensor,
    pressure_sensor,
    surface_wetness_sensor,
    temp_minimal,
    temp_maximum,
    pressure_minimal,
    pressure_maximum,
    humidity_minimal,
    humidity_maximum,
    humidity_spike_limit,
    temp_spike_limit,
    pressure_spike_limit,
    surface_wetness_wet_baseline,
    surface_wetness_dry_baseline,
    created_at,
    updated_at
)
VALUES (
           1,
           0,
           0,
           0,
           'ESP32-C6',
           'DHT22',
           'DHT22',
           'BMP180',
           'HW-028',
           -45,
           60,
           940,
           1060,
           0,
           100,
           15,
           3,
           1.5,
           150,
           3250,
           CURRENT_TIMESTAMP,
           CURRENT_TIMESTAMP
       );