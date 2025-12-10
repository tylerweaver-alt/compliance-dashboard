-- Migration: Add foreign key constraints and performance indexes to calls table
-- Run this in the Neon SQL Editor
-- Date: 2024-12-10
--
-- IMPORTANT: Column names are based on db/schema.sql (single source of truth)
-- calls table columns used here:
--   - parish_id (integer NOT NULL)
--   - response_date (text) - date as text
--   - response_date_time (text) - datetime as text
--   - compliance_time_minutes (numeric) - response time in minutes
--   - uploaded_at (timestamptz)
--   - response_number (text) - incident lookup
--   - is_excluded (boolean)

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS (C4)
-- ============================================================================

-- Note: parish_id is NOT NULL in schema, so we cannot use ON DELETE SET NULL
-- Using ON DELETE RESTRICT to prevent orphaned calls
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_calls_parish_id'
      AND table_name = 'calls'
  ) THEN
    -- First verify no orphans exist
    IF EXISTS (
      SELECT 1 FROM calls
      WHERE parish_id NOT IN (SELECT id FROM parishes)
    ) THEN
      RAISE EXCEPTION 'Orphaned calls exist - clean up before adding FK constraint';
    END IF;

    ALTER TABLE calls
    ADD CONSTRAINT fk_calls_parish_id
    FOREIGN KEY (parish_id)
    REFERENCES parishes(id)
    ON DELETE RESTRICT;
  END IF;
END $$;

-- ============================================================================
-- PERFORMANCE INDEXES (H6)
-- ============================================================================

-- Index for date range queries (response_date is text, for sorting)
CREATE INDEX IF NOT EXISTS idx_calls_response_date
  ON calls (response_date DESC);

-- Composite index for parish + date queries
CREATE INDEX IF NOT EXISTS idx_calls_parish_response_date
  ON calls (parish_id, response_date DESC);

-- Index for response time analysis (compliance_time_minutes is numeric)
CREATE INDEX IF NOT EXISTS idx_calls_compliance_time
  ON calls (compliance_time_minutes)
  WHERE compliance_time_minutes IS NOT NULL;

-- Index for compliance queries (parish + response time)
CREATE INDEX IF NOT EXISTS idx_calls_parish_compliance
  ON calls (parish_id, compliance_time_minutes)
  WHERE compliance_time_minutes IS NOT NULL;

-- Index for upload tracking (uploaded_at is timestamptz)
CREATE INDEX IF NOT EXISTS idx_calls_uploaded_at
  ON calls (uploaded_at DESC);

-- Index for incident lookups (response_number is the incident identifier)
CREATE INDEX IF NOT EXISTS idx_calls_response_number
  ON calls (response_number);

-- Index for exclusion queries
CREATE INDEX IF NOT EXISTS idx_calls_excluded
  ON calls (is_excluded, response_date DESC)
  WHERE is_excluded = true;

-- Index for geospatial queries (if doing point-in-polygon lookups)
CREATE INDEX IF NOT EXISTS idx_calls_geom
  ON calls USING GIST (geom)
  WHERE geom IS NOT NULL;

-- ============================================================================
-- ANALYZE TABLES
-- ============================================================================

-- Update statistics for query planner
ANALYZE calls;
ANALYZE parishes;

