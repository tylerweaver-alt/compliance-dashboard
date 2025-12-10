-- =============================================================================
-- Migration: Normalize allowed_regions column defaults and semantics
-- Date: 2025-12-11
-- Purpose: Database organization for future region permission behavior
-- 
-- This migration is DATABASE-ONLY and does NOT change any UI or TypeScript logic.
-- =============================================================================

-- Task A1: Normalize allowed_regions default to NULL
-- ---------------------------------------------------
-- The intended semantics for allowed_regions are:
--   NULL            = user can see all regions
--   ARRAY[]::text[] = user has no regions
--   non-empty array = user has specific regions

-- Step 1: Drop the existing default (which is '{}')
ALTER TABLE public.users
ALTER COLUMN allowed_regions DROP DEFAULT;

-- Step 2: Set the new default to NULL
ALTER TABLE public.users
ALTER COLUMN allowed_regions SET DEFAULT NULL;

-- Step 3: Normalize obvious contradictions
-- Users marked as "has_all_regions = true" with an empty array should be normalized
-- to allowed_regions = NULL (intended to mean "all regions").
-- We do NOT modify rows where has_all_regions = false.
-- We do NOT overwrite non-empty allowed_regions for users where has_all_regions = true.
UPDATE public.users
SET allowed_regions = NULL
WHERE has_all_regions = true
  AND allowed_regions = ARRAY[]::text[];

-- Task A2: Document intended semantics via column comments
-- ---------------------------------------------------------
COMMENT ON COLUMN public.users.allowed_regions IS
'Intended semantics: NULL = all regions, empty array = no regions, non-empty array = specific regions.';

COMMENT ON COLUMN public.users.has_all_regions IS
'Legacy flag currently used by app logic. Intended to be replaced by allowed_regions semantics in a future code update. Do not drop yet.';

