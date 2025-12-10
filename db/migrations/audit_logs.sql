-- Migration: Create audit_logs table (matches existing production schema)
-- Run this in the Neon SQL Editor
-- NOTE: This table already exists in production with the schema below.
-- This migration is for reference/new environments only.

CREATE TABLE IF NOT EXISTS audit_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  actor_email   text,
  actor_role    text,
  category      text NOT NULL,          -- e.g. "AUTH", "CALLS", "EXCLUSIONS", "SYSTEM"
  action        text NOT NULL,          -- e.g. "LOGIN_SUCCESS", "CSV_UPLOAD", "SYSADMIN_ACCESS_DENIED"
  target_email  text,                   -- target user email (for user-related actions)
  target_id     uuid,                   -- uuid of target entity
  details       jsonb                   -- flexible metadata (actor_user_id, target_type, etc.)
);

-- Index for faster queries by created_at (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- Index for filtering by category
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs (category);

-- Index for filtering by action type
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);

-- Index for filtering by actor
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_email ON audit_logs (actor_email);

