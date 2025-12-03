-- Migration: Add id column to regions table
-- Run this in the Neon SQL Editor BEFORE using the Regions & Areas admin panel

-- The regions table uses 'name' as primary key.
-- Add 'id' as a unique auto-incrementing column for easier reference in APIs.
ALTER TABLE regions
  ADD COLUMN IF NOT EXISTS id SERIAL UNIQUE;

-- Verify the change
SELECT id, name, display_order FROM regions ORDER BY display_order, name;

