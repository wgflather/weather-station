CREATE TABLE hourly_weather_record (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_id           VARCHAR(50)      NOT NULL,
    temperature_avg     DOUBLE PRECISION,
    pressure_avg        DOUBLE PRECISION,
    humidity_avg        DOUBLE PRECISION,
    surface_wetness_avg DOUBLE PRECISION,
    hour                TIMESTAMPTZ      NOT NULL,
    CONSTRAINT uq_hourly_device_hour UNIQUE (device_id, hour)
);

CREATE TABLE daily_weather_record (
    id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    device_id           VARCHAR(50)      NOT NULL,
    temperature_min     DOUBLE PRECISION,
    temperature_max     DOUBLE PRECISION,
    temperature_avg     DOUBLE PRECISION,
    pressure_min        DOUBLE PRECISION,
    pressure_max        DOUBLE PRECISION,
    pressure_avg        DOUBLE PRECISION,
    humidity_min        DOUBLE PRECISION,
    humidity_max        DOUBLE PRECISION,
    humidity_avg        DOUBLE PRECISION,
    surface_wetness_min DOUBLE PRECISION,
    surface_wetness_max DOUBLE PRECISION,
    surface_wetness_avg DOUBLE PRECISION,
    date                DATE             NOT NULL,
    CONSTRAINT uq_daily_device_date UNIQUE (device_id, date)
);
