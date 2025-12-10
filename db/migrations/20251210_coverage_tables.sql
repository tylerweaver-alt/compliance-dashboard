-- Migration: Create coverage posts and policy rules tables
-- Run this in the Neon SQL Editor
-- Date: 2024-12-10
-- 
-- This migration moves inline CREATE TABLE statements from API routes
-- into proper migrations (H5 fix).

-- ============================================================================
-- COVERAGE POSTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS coverage_posts (
  id SERIAL PRIMARY KEY,
  region_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  intersection TEXT,
  lat DECIMAL(10, 6),
  lng DECIMAL(10, 6),
  default_units INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  coverage_level INTEGER DEFAULT 4,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for coverage_posts
CREATE INDEX IF NOT EXISTS idx_coverage_posts_region 
  ON coverage_posts (region_id);

CREATE INDEX IF NOT EXISTS idx_coverage_posts_active 
  ON coverage_posts (is_active, region_id);

-- ============================================================================
-- POLICY RULES TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS policy_rules (
  id SERIAL PRIMARY KEY,
  region_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  priority INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  is_auto_execute BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_rules_region 
  ON policy_rules (region_id);

CREATE INDEX IF NOT EXISTS idx_policy_rules_active 
  ON policy_rules (is_active, region_id);

CREATE TABLE IF NOT EXISTS policy_rule_conditions (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER REFERENCES policy_rules(id) ON DELETE CASCADE,
  condition_type VARCHAR(50) NOT NULL,
  target_parish VARCHAR(100),
  target_post_id INTEGER,
  operator VARCHAR(10) NOT NULL,
  value VARCHAR(100) NOT NULL,
  logic_operator VARCHAR(10) DEFAULT 'AND'
);

CREATE INDEX IF NOT EXISTS idx_policy_rule_conditions_rule 
  ON policy_rule_conditions (rule_id);

CREATE TABLE IF NOT EXISTS policy_rule_actions (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER REFERENCES policy_rules(id) ON DELETE CASCADE,
  action_type VARCHAR(50) NOT NULL,
  target_level INTEGER,
  target_post_id INTEGER,
  from_parish VARCHAR(100),
  to_parish VARCHAR(100),
  message TEXT,
  execution_order INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_policy_rule_actions_rule 
  ON policy_rule_actions (rule_id);

-- ============================================================================
-- ANALYZE TABLES
-- ============================================================================

ANALYZE coverage_posts;
ANALYZE policy_rules;
ANALYZE policy_rule_conditions;
ANALYZE policy_rule_actions;

