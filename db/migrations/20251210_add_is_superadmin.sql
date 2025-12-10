-- Migration: Add is_superadmin column to users table
-- Date: 2025-12-10
-- Purpose: Move SuperAdmin determination from hardcoded email list to database column

-- Add the is_superadmin column
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_superadmin boolean DEFAULT false NOT NULL;

-- Seed known SuperAdmin accounts
-- These are the only users with SuperAdmin privileges
UPDATE public.users
SET is_superadmin = true
WHERE LOWER(email) IN ('tyler.weaver@acadian.com', 'jrc7192@gmail.com');

-- Create a partial index for quick SuperAdmin lookups
-- Only indexes rows where is_superadmin is true (very few rows)
CREATE INDEX IF NOT EXISTS idx_users_is_superadmin
  ON public.users (is_superadmin)
  WHERE is_superadmin = true;

-- Add a comment explaining the column
COMMENT ON COLUMN public.users.is_superadmin IS 'Grants access to /sysadmin routes and elevated system privileges';

