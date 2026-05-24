create table weather_records (
    id bigint generated always as identity primary key,
    device_id VARCHAR(50),
    temperature double precision,
    pressure double precision,
    measured_at timestamptz not null,
    data_quality VARCHAR(25) NOT NULL
);

CREATE INDEX idx_weather_quality_time
    ON weather_records (data_quality, measured_at DESC);