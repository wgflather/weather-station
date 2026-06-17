ALTER TABLE station_configuration
    ADD COLUMN temperature_provider VARCHAR(50) NOT NULL DEFAULT 'LOCAL_SENSOR';

ALTER TABLE station_configuration
    ADD COLUMN humidity_provider VARCHAR(50) NOT NULL DEFAULT 'LOCAL_SENSOR';

ALTER TABLE station_configuration
    ADD COLUMN pressure_provider VARCHAR(50) NOT NULL DEFAULT 'LOCAL_SENSOR';

ALTER TABLE station_configuration
    ADD COLUMN wind_provider VARCHAR(50) NOT NULL DEFAULT 'LOCAL_SENSOR';

ALTER TABLE station_configuration
    ADD COLUMN uv_index_provider VARCHAR(50) NOT NULL DEFAULT 'LOCAL_SENSOR';

ALTER TABLE station_configuration
    ADD COLUMN uv_index_sensor VARCHAR(100);

ALTER TABLE station_configuration
    ADD COLUMN wind_sensor VARCHAR(100);
