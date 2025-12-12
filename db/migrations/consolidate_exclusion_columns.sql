-- Migration: Consolidate Exclusion & Confirmation Columns
-- Run this in the Neon SQL Editor
-- Purpose: Clean up the messy calls table columns for exclusions/confirmations

-- ============================================================================
-- 1. ENSURE CORE COLUMNS EXIST
-- ============================================================================

-- Core exclusion columns (keep these)
ALTER TABLE calls ADD COLUMN IF NOT EXISTS is_excluded BOOLEAN DEFAULT FALSE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS exclusion_type VARCHAR(10); -- 'MANUAL' or 'AUTO'
ALTER TABLE calls ADD COLUMN IF NOT EXISTS exclusion_reason TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS excluded_at TIMESTAMPTZ;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS excluded_by_user_id UUID;

-- Core confirmation columns
ALTER TABLE calls ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT FALSE;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS confirmed_by_user_id UUID;

-- ============================================================================
-- 2. MIGRATE EXISTING AUTO-EXCLUSION DATA TO UNIFIED COLUMNS
-- ============================================================================

-- Set is_excluded = TRUE for any auto-excluded calls
UPDATE calls 
SET is_excluded = TRUE,
    exclusion_type = 'AUTO',
    exclusion_reason = COALESCE(auto_exclusion_reason, 'Auto-Excluded: ' || COALESCE(auto_exclusion_strategy, 'Unknown')),
    excluded_at = COALESCE(auto_excluded_at, NOW())
WHERE is_auto_excluded = TRUE 
  AND (is_excluded IS NULL OR is_excluded = FALSE);

-- Set exclusion_type for existing manual exclusions that don't have it
UPDATE calls 
SET exclusion_type = 'MANUAL'
WHERE is_excluded = TRUE 
  AND is_auto_excluded IS NOT TRUE
  AND exclusion_type IS NULL;

-- ============================================================================
-- 3. CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_calls_is_excluded ON calls(is_excluded) WHERE is_excluded = TRUE;
CREATE INDEX IF NOT EXISTS idx_calls_exclusion_type ON calls(exclusion_type);
CREATE INDEX IF NOT EXISTS idx_calls_is_confirmed ON calls(is_confirmed) WHERE is_confirmed = TRUE;

-- ============================================================================
-- 4. KEEP THESE COLUMNS FOR ENGINE INTERNALS (but won't show in UI)
-- ============================================================================
-- is_auto_excluded - kept for backward compatibility queries
-- auto_exclusion_strategy - kept for detailed reporting
-- auto_exclusion_metadata - kept for audit trail details
-- auto_exclusion_evaluated - kept for cron job tracking
-- auto_exclusion_evaluated_at - kept for debugging

-- ============================================================================
-- 5. VERIFICATION QUERIES
-- ============================================================================
-- Check the migration worked:
-- SELECT exclusion_type, COUNT(*) FROM calls WHERE is_excluded = TRUE GROUP BY exclusion_type;
-- SELECT is_confirmed, COUNT(*) FROM calls GROUP BY is_confirmed;


