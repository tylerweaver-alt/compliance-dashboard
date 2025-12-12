-- Migration: Create audit_logs table
-- Run this in the Neon SQL Editor

CREATE TABLE IF NOT EXISTS audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp     timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid,
  actor_email   text,
  action        text NOT NULL,          -- e.g. "USER_UPSERT", "USER_UPDATE", "REGION_CREATE"
  target_type   text NOT NULL,          -- e.g. "user", "region", "area", "upload"
  target_id     text,                   -- uuid or other identifier stored as text
  summary       text,                   -- short human-readable description
  metadata      jsonb,                  -- optional extra details
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for faster queries by timestamp (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs (timestamp DESC);

-- Index for filtering by action type
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);

-- Index for filtering by actor
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_email ON audit_logs (actor_email);

