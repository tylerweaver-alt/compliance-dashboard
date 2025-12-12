-- Migration: Target Compliance % Feature
-- Run this in the Neon SQL Editor
-- Purpose: Add target_compliance_percent to parish_settings for Phase 4

-- ============================================================================
-- 1. ADD TARGET COMPLIANCE COLUMN TO PARISH_SETTINGS
-- ============================================================================

-- Target compliance percentage per parish (0-100)
-- Used to show Red/Yellow/Green status on dashboard tiles
ALTER TABLE parish_settings ADD COLUMN IF NOT EXISTS target_compliance_percent NUMERIC(5,2) DEFAULT 90.0;

-- Add a constraint to ensure valid percentage values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'parish_settings' AND constraint_name = 'chk_target_compliance_percent'
  ) THEN
    ALTER TABLE parish_settings 
    ADD CONSTRAINT chk_target_compliance_percent 
    CHECK (target_compliance_percent >= 0 AND target_compliance_percent <= 100);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- ============================================================================
-- 2. SET REASONABLE DEFAULTS FOR EXISTING PARISHES
-- ============================================================================

-- Update any NULL values to default of 90%
UPDATE parish_settings 
SET target_compliance_percent = 90.0 
WHERE target_compliance_percent IS NULL;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- SELECT parish_id, target_compliance_percent FROM parish_settings;

