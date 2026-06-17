-- Sensor columns on weather_records (nullable — older records won't have these)
ALTER TABLE weather_records ADD COLUMN wind       DOUBLE PRECISION;
ALTER TABLE weather_records ADD COLUMN uv_index   DOUBLE PRECISION;

ALTER TABLE weather_records ADD COLUMN wind_data_quality     VARCHAR(50);
ALTER TABLE weather_records ADD COLUMN uv_index_data_quality VARCHAR(50);

-- Validation thresholds on station_configuration
ALTER TABLE station_configuration ADD COLUMN wind_minimal        DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE station_configuration ADD COLUMN wind_maximum        DOUBLE PRECISION NOT NULL DEFAULT 60;
ALTER TABLE station_configuration ADD COLUMN wind_spike_limit    DOUBLE PRECISION NOT NULL DEFAULT 20;
ALTER TABLE station_configuration ADD COLUMN uv_index_minimal    DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE station_configuration ADD COLUMN uv_index_maximum    DOUBLE PRECISION NOT NULL DEFAULT 16;
ALTER TABLE station_configuration ADD COLUMN uv_index_spike_limit DOUBLE PRECISION NOT NULL DEFAULT 5;
