-- Migration: Add is_superadmin column to users table
-- Run this in the Neon SQL Editor

-- Add the is_superadmin column (defaults to false for existing users)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_superadmin boolean NOT NULL DEFAULT false;

-- Index for faster superadmin lookups (optional, small table)
CREATE INDEX IF NOT EXISTS idx_users_is_superadmin ON users (is_superadmin) WHERE is_superadmin = true;

-- ============================================================================
-- MANUAL SEED: Flag owner emails as superadmin
-- Run this separately after migration if desired, or manually in SQL editor
-- ============================================================================
-- UPDATE users
-- SET is_superadmin = true
-- WHERE lower(email) IN ('tylerkweaver20@gmail.com', 'jrc7192@gmail.com');

