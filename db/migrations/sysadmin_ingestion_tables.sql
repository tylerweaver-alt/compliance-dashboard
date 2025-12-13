-- Migration: Create sysadmin ingestion control tables
-- Run this in the Neon SQL Editor

-- ============================================================================
-- Table: ingestion_sources
-- Tracks configuration for each ingestion source (e.g., SQL Server CAD/Visinet)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ingestion_sources (
  id                  serial PRIMARY KEY,
  type                text NOT NULL UNIQUE,      -- e.g., 'sqlserver'
  enabled             boolean NOT NULL DEFAULT false,
  watermark_ts        timestamptz,               -- last successfully ingested timestamp
  watermark_id        bigint,                    -- last successfully ingested row id
  batch_size          int NOT NULL DEFAULT 500,
  poll_interval_ms    int NOT NULL DEFAULT 30000,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Ensure exactly one sqlserver row exists (upsert pattern)
INSERT INTO ingestion_sources (type, enabled, batch_size, poll_interval_ms)
VALUES ('sqlserver', false, 500, 30000)
ON CONFLICT (type) DO NOTHING;

-- ============================================================================
-- Table: ingestion_worker_status
-- Tracks real-time status and metrics for each ingestion source worker
-- ============================================================================
CREATE TABLE IF NOT EXISTS ingestion_worker_status (
  source_id               int PRIMARY KEY REFERENCES ingestion_sources(id) ON DELETE CASCADE,
  state                   text NOT NULL DEFAULT 'IDLE' CHECK (state IN ('IDLE', 'CONNECTING', 'RUNNING', 'ERROR', 'DISABLED')),
  last_heartbeat_at       timestamptz,
  last_success_at         timestamptz,
  last_error_at           timestamptz,
  last_error_message      text,
  last_ingested_call_id   text,
  last_ingested_ts        timestamptz,
  rows_ingested_total     bigint NOT NULL DEFAULT 0,
  rows_ingested_last_60s  int NOT NULL DEFAULT 0,
  avg_rows_per_sec_60s    numeric(10,2) NOT NULL DEFAULT 0,
  current_lag_seconds     int NOT NULL DEFAULT 0,
  uptime_seconds          int NOT NULL DEFAULT 0,
  downtime_seconds        int
);

-- Ensure worker status row exists for sqlserver source
INSERT INTO ingestion_worker_status (source_id, state)
SELECT id, 'IDLE' FROM ingestion_sources WHERE type = 'sqlserver'
ON CONFLICT (source_id) DO NOTHING;

-- ============================================================================
-- Table: ingestion_sqlserver_logs
-- SQL-only ingestion logs for the sysadmin portal
-- Exclusively for SQL Server pipeline events (not mixed with general audit_logs)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ingestion_sqlserver_logs (
  id              serial PRIMARY KEY,
  source_id       int REFERENCES ingestion_sources(id) ON DELETE SET NULL,
  level           text NOT NULL CHECK (level IN ('INFO', 'WARN', 'ERROR')),
  event_type      text NOT NULL,  -- CONNECT, RUN_START, RUN_END, UPSERT, ERROR, WATERMARK_ADVANCE, etc.
  message         text NOT NULL,
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ingestion_sqlserver_logs_created_at 
  ON ingestion_sqlserver_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ingestion_sqlserver_logs_source_id 
  ON ingestion_sqlserver_logs (source_id);

CREATE INDEX IF NOT EXISTS idx_ingestion_sqlserver_logs_level 
  ON ingestion_sqlserver_logs (level);

CREATE INDEX IF NOT EXISTS idx_ingestion_sqlserver_logs_event_type 
  ON ingestion_sqlserver_logs (event_type);

