-- =============================================================================
-- Migration: Add is_internal column to users table
-- Date: 2025-12-11
-- Purpose: Distinguish internal staff from client users
-- 
-- Internal users are Acadian/CADalytix staff who should not appear in
-- client-facing admin user lists but retain full access to their assigned
-- functionality (e.g., is_superadmin for sysadmin access).
-- =============================================================================

-- Step 1: Add is_internal column to public.users
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

-- Step 2: Mark known internal accounts
-- These are developer/owner accounts that should not appear in client user lists
UPDATE public.users
SET is_internal = true
WHERE LOWER(email) IN (
  'tyler.weaver@acadian.com',
  'jrc7192@gmail.com'
);

-- Step 3: Add an index for filtering by is_internal
-- Used by admin user list queries to exclude internal staff
CREATE INDEX IF NOT EXISTS idx_users_is_internal
ON public.users (is_internal);

-- Step 4: Add column comment for documentation
COMMENT ON COLUMN public.users.is_internal IS
'True for internal Acadian/CADalytix staff. Internal users are excluded from client-facing admin user lists but retain full access to their assigned functionality.';

