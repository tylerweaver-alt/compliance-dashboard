-- Migration: Manual Exclusion Support
-- Run this in the Neon SQL Editor
-- Purpose: Add fields to track manual exclusion details for audit trail

-- ============================================================================
-- 1. ADD MANUAL EXCLUSION TRACKING COLUMNS TO CALLS TABLE
-- ============================================================================

-- Timestamp when the manual exclusion was applied
ALTER TABLE calls ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ;

-- User who applied the manual exclusion
ALTER TABLE calls ADD COLUMN IF NOT EXISTS excluded_by_user_id UUID;

-- ============================================================================
-- 2. ENSURE EXCLUSION_LOGS TABLE EXISTS (from Phase 1)
-- ============================================================================
-- This is a safety check in case migrations are run out of order

CREATE TABLE IF NOT EXISTS exclusion_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id INTEGER NOT NULL,
  exclusion_type VARCHAR(10) NOT NULL CHECK (exclusion_type IN ('AUTO', 'MANUAL')),
  strategy_key VARCHAR(50),
  reason TEXT NOT NULL,
  created_by_user_id UUID,
  created_by_email VARCHAR(255),
  engine_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reverted_at TIMESTAMPTZ,
  reverted_by_user_id UUID,
  reverted_by_email VARCHAR(255),
  revert_reason TEXT
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_exclusion_logs_call_id ON exclusion_logs(call_id);
CREATE INDEX IF NOT EXISTS idx_exclusion_logs_type_date ON exclusion_logs(exclusion_type, created_at);
CREATE INDEX IF NOT EXISTS idx_exclusion_logs_user ON exclusion_logs(created_by_user_id);

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'calls' AND column_name IN ('excluded_at', 'excluded_by_user_id');

