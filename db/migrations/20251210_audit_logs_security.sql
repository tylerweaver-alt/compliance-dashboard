-- Migration: Update audit_logs table for security enhancements
-- Run this in the Neon SQL Editor
-- Date: 2024-12-10

-- The existing audit_logs table already has most fields, but we need to ensure
-- the category column exists and add the proper indexes for the new audit system.

-- Add category column if it doesn't exist (it exists per schema, but this is idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'audit_logs' AND column_name = 'category'
  ) THEN
    ALTER TABLE audit_logs ADD COLUMN category text;
  END IF;
END $$;

-- Set default category for existing rows without one
UPDATE audit_logs SET category = 'SYSTEM' WHERE category IS NULL;

-- Make category NOT NULL going forward
ALTER TABLE audit_logs ALTER COLUMN category SET NOT NULL;

-- Add composite indexes for efficient querying by category and date
CREATE INDEX IF NOT EXISTS idx_audit_logs_category_created 
  ON audit_logs (category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created 
  ON audit_logs (action, created_at DESC);

-- Add index for actor lookups
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_category 
  ON audit_logs (actor_email, category);

-- Update existing LOGIN/LOGOUT actions to use AUTH category
UPDATE audit_logs 
SET category = 'AUTH' 
WHERE action IN ('LOGIN', 'LOGOUT', 'LOGIN_SUCCESS', 'LOGIN_DENIED') 
  AND category != 'AUTH';

-- Update existing user-related actions to use CONFIG category
UPDATE audit_logs 
SET category = 'CONFIG' 
WHERE action IN ('USER_UPSERT', 'USER_UPDATE', 'USER_CREATE', 'USER_DELETE',
                 'REGION_CREATE', 'REGION_UPDATE', 'PARISH_CREATE', 'PARISH_UPDATE')
  AND category NOT IN ('AUTH', 'CONFIG');

-- Update upload actions to CALLS category
UPDATE audit_logs 
SET category = 'CALLS' 
WHERE action IN ('UPLOAD_COMPLIANCE', 'CALL_EDITED', 'CALL_UPDATE')
  AND category NOT IN ('AUTH', 'CONFIG', 'CALLS');

-- Analyze the table to update statistics
ANALYZE audit_logs;

