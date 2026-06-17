ALTER TABLE weather_records
    ADD COLUMN wind_direction        DOUBLE PRECISION,
    ADD COLUMN wind_direction_data_quality VARCHAR(20);
