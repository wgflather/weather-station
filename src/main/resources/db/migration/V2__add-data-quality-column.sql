ALTER TABLE weather_records
    ADD COLUMN data_quality VARCHAR(25) NOT NULL DEFAULT 'OK';