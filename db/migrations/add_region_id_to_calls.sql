-- Migration: Add region_id column to calls table
-- Run this in the Neon SQL Editor

-- Add region_id column to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS region_id INTEGER;

-- Add foreign key constraint to regions table
ALTER TABLE calls 
  ADD CONSTRAINT fk_calls_region 
  FOREIGN KEY (region_id) 
  REFERENCES regions(id) 
  ON DELETE SET NULL;

-- Create index for faster filtering by region
CREATE INDEX IF NOT EXISTS idx_calls_region_id ON calls(region_id);

-- Update existing calls to belong to Central Louisiana (region_id = 1) if they have parish data
-- This is optional - you may want to leave existing calls without a region
UPDATE calls c
SET region_id = (
  SELECT r.id 
  FROM parishes p 
  JOIN regions r ON p.region = r.name 
  WHERE p.id = c.parish_id
  LIMIT 1
)
WHERE c.region_id IS NULL AND c.parish_id IS NOT NULL;

-- Verify the changes
SELECT 
  r.name as region_name,
  COUNT(c.id) as call_count
FROM calls c
LEFT JOIN regions r ON c.region_id = r.id
GROUP BY r.name
ORDER BY r.name;

