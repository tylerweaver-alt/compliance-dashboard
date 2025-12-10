-- Migration: Create sysadmin_log table for system logging
-- Date: 2025-12-10
-- Purpose: Long-term queryable log for health status, system events, cron jobs, etc.

-- Create the sysadmin_log table
CREATE TABLE IF NOT EXISTS public.sysadmin_log (
  id            bigserial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  category      text NOT NULL,    -- 'HEALTH', 'SYSTEM', 'AUTH', 'CONFIG', 'CALLS', 'EXCLUSIONS', 'CRON'
  component_id  text,             -- 'NEON_DB', 'VERCEL', 'GITHUB', 'INTERNET', 'AUTH', 'CALL_INGEST', 'CAD_SQL', 'CAD_APP'
  status        text,             -- 'UP', 'DEGRADED', 'DOWN', 'UNKNOWN' (optional for non-health events)
  status_text   text,             -- 'Online', 'Degraded / Issues Found', 'Offline', 'Unknown'
  level         text NOT NULL,    -- 'INFO', 'WARN', 'ERROR'
  message       text NOT NULL,
  actor_email   text,             -- optional, who triggered the event
  source        text,             -- 'health_check', 'cron', 'auth', 'upload', 'sysadmin_ui', etc.
  details       jsonb             -- structured extra data (optional)
);

-- Index for querying by time (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_sysadmin_log_created
  ON public.sysadmin_log (created_at DESC);

-- Index for filtering by component and time
CREATE INDEX IF NOT EXISTS idx_sysadmin_log_component
  ON public.sysadmin_log (component_id, created_at DESC);

-- Index for filtering by category and time
CREATE INDEX IF NOT EXISTS idx_sysadmin_log_category
  ON public.sysadmin_log (category, created_at DESC);

-- Index for filtering by level (e.g., show only errors)
CREATE INDEX IF NOT EXISTS idx_sysadmin_log_level
  ON public.sysadmin_log (level, created_at DESC);

-- Add table comment
COMMENT ON TABLE public.sysadmin_log IS 'System-wide log for health status, cron jobs, critical events, and diagnostics';

