-- Migration: Time Edit Audit Logging
-- Run this in the Neon SQL Editor
-- Purpose: Track all time field edits on calls with full audit trail

-- ============================================================================
-- 1. CREATE TIME_EDIT_LOGS TABLE
-- ============================================================================
-- Dedicated table for time field edits with comprehensive audit information
-- Stores before/after snapshots and reason for each edit

CREATE TABLE IF NOT EXISTS time_edit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to the call being edited
  call_id INTEGER NOT NULL,
  
  -- Which time field was edited
  field_name VARCHAR(50) NOT NULL,
  -- e.g., 'call_in_que_time', 'assigned_time', 'arrived_at_scene_time', etc.
  
  -- Before/After values
  old_value TEXT,
  new_value TEXT,
  
  -- Full call snapshot BEFORE the edit (for audit trail)
  call_snapshot_before JSONB NOT NULL,
  
  -- User who made the edit
  edited_by_user_id UUID,
  edited_by_email VARCHAR(255) NOT NULL,
  edited_by_name VARCHAR(255),
  edited_by_role VARCHAR(50),
  
  -- Required reason for the edit
  reason TEXT NOT NULL,
  
  -- Optional metadata (e.g., weather alert info, system context)
  metadata JSONB,
  
  -- Grouping key for related edits (e.g., multiple fields edited at once)
  edit_session_id UUID,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 2. CREATE INDEXES
-- ============================================================================

-- Index for looking up edits by call
CREATE INDEX IF NOT EXISTS idx_time_edit_logs_call_id ON time_edit_logs(call_id);

-- Index for looking up edits by user
CREATE INDEX IF NOT EXISTS idx_time_edit_logs_user ON time_edit_logs(edited_by_email);

-- Index for chronological queries
CREATE INDEX IF NOT EXISTS idx_time_edit_logs_created ON time_edit_logs(created_at DESC);

-- Index for grouping related edits
CREATE INDEX IF NOT EXISTS idx_time_edit_logs_session ON time_edit_logs(edit_session_id);

-- Index for field-specific queries
CREATE INDEX IF NOT EXISTS idx_time_edit_logs_field ON time_edit_logs(field_name);

-- ============================================================================
-- 3. ADD TRACKING COLUMNS TO CALLS TABLE (for quick edit detection)
-- ============================================================================

-- Track if any time field has been manually edited
ALTER TABLE calls ADD COLUMN IF NOT EXISTS has_time_edits BOOLEAN DEFAULT FALSE;

-- Track last edit timestamp for quick sorting/filtering
ALTER TABLE calls ADD COLUMN IF NOT EXISTS last_time_edit_at TIMESTAMPTZ;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'time_edit_logs';
--
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'calls' AND column_name IN ('has_time_edits', 'last_time_edit_at');

