-- Migration: Peak Call Load Auto-Exclusion Strategy
-- Run this in the Neon SQL Editor
-- Purpose: Add support for the PEAK_CALL_LOAD auto-exclusion strategy
-- This strategy auto-excludes calls when there are 3+ calls within a 45-minute
-- window in the same parish and the call is out of compliance.

-- ============================================================================
-- 1. ADD HUMAN REVIEW COLUMNS TO CALLS TABLE
-- ============================================================================
-- These columns track calls flagged for human review (compliant calls in peak load window)

-- Flag indicating the call needs human review (compliant but in peak load window)
ALTER TABLE calls ADD COLUMN IF NOT EXISTS needs_human_review BOOLEAN DEFAULT FALSE;

-- Human-readable reason why the call was flagged for review
ALTER TABLE calls ADD COLUMN IF NOT EXISTS human_review_reason TEXT;

-- Timestamp when the human review flag was set
ALTER TABLE calls ADD COLUMN IF NOT EXISTS human_review_flagged_at TIMESTAMPTZ;

-- ============================================================================
-- 2. INSERT DEFAULT STRATEGY CONFIGURATION FOR PEAK_CALL_LOAD
-- ============================================================================
-- Global default configuration for the PEAK_CALL_LOAD strategy

INSERT INTO auto_exclusion_configs (region_id, strategy_key, is_enabled, config)
VALUES 
  (NULL, 'PEAK_CALL_LOAD', FALSE, '{
    "window_minutes": 45,
    "min_calls_threshold": 3,
    "description": "Auto-excludes 3rd+ calls in a 45-minute window within the same parish when out of compliance"
  }')
ON CONFLICT (region_id, strategy_key) DO NOTHING;

-- ============================================================================
-- 3. CREATE INDEX FOR EFFICIENT PEAK CALL LOAD QUERIES
-- ============================================================================
-- Index to optimize the sliding window query on parish and queue time

CREATE INDEX IF NOT EXISTS idx_calls_parish_queue_time 
ON calls (parish_id, call_in_que_time);

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these to verify the migration was successful:

-- Check new columns on calls table
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'calls' AND column_name LIKE '%human_review%';

-- Check PEAK_CALL_LOAD config exists
-- SELECT * FROM auto_exclusion_configs WHERE strategy_key = 'PEAK_CALL_LOAD';

-- Check index exists
-- SELECT indexname FROM pg_indexes WHERE tablename = 'calls' AND indexname = 'idx_calls_parish_queue_time';

