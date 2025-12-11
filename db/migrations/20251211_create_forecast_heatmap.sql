CREATE TABLE IF NOT EXISTS forecast_heatmap (
    id              BIGSERIAL PRIMARY KEY,
    parish_id       INTEGER NOT NULL,
    zone_id         INTEGER,
    cell_id         TEXT NOT NULL,           -- e.g. 'global', hex id, grid key
    bucket_start    TIMESTAMPTZ NOT NULL,
    bucket_end      TIMESTAMPTZ NOT NULL,
    forecast_calls  NUMERIC NOT NULL,
    forecast_conf_low   NUMERIC,
    forecast_conf_high  NUMERIC,
    model_version   TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fheatmap_lookup
    ON forecast_heatmap (parish_id, bucket_start, bucket_end, cell_id);
