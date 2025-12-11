-- 20251211_create_zones_table.sql

CREATE TABLE IF NOT EXISTS zones (
    id          SERIAL PRIMARY KEY,
    parish_id   INTEGER NOT NULL,
    name        TEXT NOT NULL,
    geom        geometry(MULTIPOLYGON, 4326) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_zones_geom
    ON zones USING GIST (geom);
