-- Migration: Add ingestion_source_secrets table for encrypted SQL Server credentials
-- Run this in the Neon SQL Editor AFTER sysadmin_ingestion_tables.sql

-- ============================================================================
-- Table: ingestion_source_secrets
-- Stores encrypted connection credentials for each ingestion source
-- Password is encrypted with AES-256-GCM using APP_MASTER_KEY
-- ============================================================================
CREATE TABLE IF NOT EXISTS ingestion_source_secrets (
  source_id           int PRIMARY KEY REFERENCES ingestion_sources(id) ON DELETE CASCADE,
  host                text,
  port                int DEFAULT 1433,
  database            text,
  username            text,
  password_encrypted  text,  -- AES-256-GCM encrypted, format: {iv}.{authTag}.{ciphertext} base64
  encrypt_connection  boolean NOT NULL DEFAULT true,
  trust_server_cert   boolean NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          text  -- email of user who last updated
);

-- Create secrets row for existing sqlserver source
INSERT INTO ingestion_source_secrets (source_id)
SELECT id FROM ingestion_sources WHERE type = 'sqlserver'
ON CONFLICT (source_id) DO NOTHING;

-- ============================================================================
-- Update ingestion_worker_status to add NOT_CONFIGURED state
-- ============================================================================
ALTER TABLE ingestion_worker_status 
DROP CONSTRAINT IF EXISTS ingestion_worker_status_state_check;

ALTER TABLE ingestion_worker_status
ADD CONSTRAINT ingestion_worker_status_state_check 
CHECK (state IN ('NOT_CONFIGURED', 'DISABLED', 'IDLE', 'CONNECTING', 'RUNNING', 'ERROR'));

-- Update existing IDLE rows to NOT_CONFIGURED if no secrets exist
UPDATE ingestion_worker_status 
SET state = 'NOT_CONFIGURED'
WHERE source_id IN (
  SELECT s.source_id 
  FROM ingestion_source_secrets s
  WHERE s.host IS NULL OR s.database IS NULL OR s.username IS NULL OR s.password_encrypted IS NULL
);

-- ============================================================================
-- Add ingestion_logs table (if not exists) - matches spec naming
-- This is an alias/alternative to ingestion_sqlserver_logs for clarity
-- ============================================================================
-- Note: We use ingestion_sqlserver_logs as it already exists

-- ============================================================================
-- Index for faster lookups
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ingestion_source_secrets_source_id 
  ON ingestion_source_secrets (source_id);

-- ============================================================================
-- Verification query (run after migration to check state)
-- ============================================================================
-- SELECT 
--   s.id as source_id, 
--   s.type, 
--   s.enabled,
--   sec.host IS NOT NULL as has_host,
--   sec.database IS NOT NULL as has_database,
--   sec.username IS NOT NULL as has_username,
--   sec.password_encrypted IS NOT NULL as has_password,
--   ws.state
-- FROM ingestion_sources s
-- LEFT JOIN ingestion_source_secrets sec ON sec.source_id = s.id
-- LEFT JOIN ingestion_worker_status ws ON ws.source_id = s.id
-- WHERE s.type = 'sqlserver';

