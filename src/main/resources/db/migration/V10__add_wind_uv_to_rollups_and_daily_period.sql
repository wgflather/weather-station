-- Wind and UV in the hourly / daily rollups, plus a day/night discriminator on the daily table.
--
-- Wind direction is stored as unit-vector-mean DEGREES rather than a cardinal string.
-- A cardinal is a presentation choice — WindDirectionLabel.fromDegrees() derives it at
-- read time — and picking the most common sector quantises twice, so an hour of readings
-- oscillating around a sector boundary gets decided by noise. The vector mean has neither
-- problem and stays chartable at any sector resolution.
--
-- wind_direction_consistency is the length of that mean vector (0..1). ~0.95 means the wind
-- held one bearing all hour; ~0.1 means it boxed the compass and the bearing is meaningless.
-- Without it, a stored bearing can't be told apart from an artefact of cancellation.

-- ---------------------------------------------------------------------------
-- Hourly
-- ---------------------------------------------------------------------------

ALTER TABLE hourly_weather_record
    ADD COLUMN uv_index_avg               DOUBLE PRECISION,
    ADD COLUMN wind_speed_avg             DOUBLE PRECISION,
    -- Peak of the reported samples in the hour, NOT a meteorological gust: the station
    -- sends one scalar wind value per report and has no 3-second peak to send.
    ADD COLUMN wind_speed_max             DOUBLE PRECISION,
    ADD COLUMN wind_direction_avg         DOUBLE PRECISION,
    ADD COLUMN wind_direction_consistency DOUBLE PRECISION;

-- ---------------------------------------------------------------------------
-- Daily
-- ---------------------------------------------------------------------------

-- No uv_index_min: outside polar latitudes it is 0.0 every single day and carries no
-- information. wind_speed_min is kept — a windy day genuinely never drops to calm.
ALTER TABLE daily_weather_record
    ADD COLUMN uv_index_avg   DOUBLE PRECISION,
    ADD COLUMN uv_index_max   DOUBLE PRECISION,
    ADD COLUMN wind_speed_min DOUBLE PRECISION,
    ADD COLUMN wind_speed_max DOUBLE PRECISION,
    ADD COLUMN wind_speed_avg DOUBLE PRECISION;

-- No daily wind direction at all: over a full day a bearing averages to noise, and
-- wind_direction_consistency on the hourly rows is where that story is already told.

-- The day/night split becomes two extra ROWS per date rather than a doubled column set.
-- DEFAULT 'FULL' keeps the existing rollup INSERT (which does not name the column) valid
-- until the Java side starts writing DAY / NIGHT rows.
ALTER TABLE daily_weather_record
    ADD COLUMN period VARCHAR(10) NOT NULL DEFAULT 'FULL';

ALTER TABLE daily_weather_record
    ADD CONSTRAINT ck_daily_period CHECK (period IN ('FULL', 'DAY', 'NIGHT'));

ALTER TABLE daily_weather_record
    DROP CONSTRAINT uq_daily_device_date;

ALTER TABLE daily_weather_record
    ADD CONSTRAINT uq_daily_device_date_period UNIQUE (device_id, date, period);

-- ---------------------------------------------------------------------------
-- Backfill (hourly)
-- ---------------------------------------------------------------------------
--
-- The hourly rollup skips rows that already exist (ON CONFLICT DO NOTHING) and only looks
-- back two days, so without this pass every hour already rolled up would keep NULL wind and
-- UV forever. Raw retention is 30 days, which bounds how far back this can reach.
--
-- Rows are matched on (device_id, hour) equality against the same date_trunc expression the
-- rollup uses, so a session-timezone mismatch on a half-hour-offset zone degrades to "not
-- backfilled" rather than to wrong values.

WITH hourly_components AS (
    SELECT device_id,
           date_trunc('hour', measured_at)                                       AS hour,
           AVG(CASE WHEN uv_index_data_quality = 'OK' THEN uv_index END)         AS uv_index_avg,
           AVG(CASE WHEN wind_data_quality = 'OK' THEN wind END)                 AS wind_speed_avg,
           MAX(CASE WHEN wind_data_quality = 'OK' THEN wind END)                 AS wind_speed_max,
           -- Calm readings are excluded: a vane sitting in still air reports noise, and
           -- averaging that noise in drags the resultant bearing off the real one.
           AVG(CASE WHEN wind_direction_data_quality = 'OK'
                     AND wind_data_quality = 'OK'
                     AND wind > 0.5
                    THEN sin(radians(wind_direction)) END)                       AS sin_mean,
           AVG(CASE WHEN wind_direction_data_quality = 'OK'
                     AND wind_data_quality = 'OK'
                     AND wind > 0.5
                    THEN cos(radians(wind_direction)) END)                       AS cos_mean
    FROM weather_records
    WHERE measured_at >= NOW() - INTERVAL '30 days'
    GROUP BY device_id, date_trunc('hour', measured_at)
),
hourly_vector AS (
    SELECT device_id,
           hour,
           uv_index_avg,
           wind_speed_avg,
           wind_speed_max,
           sqrt(sin_mean * sin_mean + cos_mean * cos_mean) AS consistency,
           degrees(atan2(sin_mean, cos_mean))              AS bearing_signed
    FROM hourly_components
),
hourly_bearing AS (
    SELECT device_id,
           hour,
           uv_index_avg,
           wind_speed_avg,
           wind_speed_max,
           consistency,
           CASE WHEN bearing_signed < 0 THEN bearing_signed + 360 ELSE bearing_signed END AS bearing
    FROM hourly_vector
)
UPDATE hourly_weather_record h
SET uv_index_avg   = v.uv_index_avg,
    wind_speed_avg = v.wind_speed_avg,
    wind_speed_max = v.wind_speed_max,
    -- atan2(0, 0) is 0 in Postgres, so near-total cancellation would otherwise be stored as
    -- a confident due north. Below the floor the bearing is left NULL.
    --
    -- The >= 360 arm keeps the column in [0, 360): a bearing of -1e-14 (a mean that wraps
    -- through north) rounds to exactly 360.0 once 360 is added to it.
    wind_direction_avg = CASE
        WHEN v.consistency >= 0.05
            THEN CASE WHEN v.bearing >= 360 THEN v.bearing - 360 ELSE v.bearing END
    END,
    wind_direction_consistency = v.consistency
FROM hourly_bearing v
WHERE h.device_id = v.device_id
  AND h.hour = v.hour;

-- ---------------------------------------------------------------------------
-- Backfill (daily) — deliberately not done here
-- ---------------------------------------------------------------------------
--
-- The daily bucket is a LOCAL date, and the station timezone is resolved in Java from
-- lat/lon (StationConfigurationMapper) rather than stored in station_configuration. Guessing
-- it from the Flyway session timezone would silently write rows bucketed on the wrong day
-- boundary, which is worse than leaving them NULL.
--
-- Existing daily rows are repaired by the rollup itself once it upserts instead of skipping
-- on conflict; that pass needs a widened lookback to reach past the current two days.
