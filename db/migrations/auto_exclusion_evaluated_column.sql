-- Migration: Add auto_exclusion_evaluated tracking column
-- Purpose: Track which calls have been processed by the auto-exclusion engine
-- This prevents duplicate processing and allows the cron job to find unprocessed calls

-- Add the tracking column to calls table
-- Defaults to FALSE, meaning the call has not been evaluated yet
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS auto_exclusion_evaluated BOOLEAN DEFAULT FALSE;

-- Add an index for efficient querying of unevaluated calls
-- The cron job and engine will query WHERE auto_exclusion_evaluated = FALSE
CREATE INDEX IF NOT EXISTS idx_calls_auto_exclusion_evaluated 
ON calls (auto_exclusion_evaluated) 
WHERE auto_exclusion_evaluated = FALSE;

-- Optional: Add a timestamp to track WHEN the call was evaluated
-- Useful for debugging and auditing
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS auto_exclusion_evaluated_at TIMESTAMPTZ;

-- Update existing calls that are already excluded to mark them as evaluated
-- This prevents the engine from re-processing calls that were already handled
UPDATE calls 
SET auto_exclusion_evaluated = TRUE,
    auto_exclusion_evaluated_at = NOW()
WHERE is_excluded = TRUE 
  AND auto_exclusion_evaluated IS NOT TRUE;

