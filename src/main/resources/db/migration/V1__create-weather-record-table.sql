create table weather_records (
    id bigint generated always as identity primary key,
    temperature double precision,
    pressure double precision,
    measured_at timestamptz not null,
    saved_at timestamptz not null
);