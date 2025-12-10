-- ============================================================================
-- Migration: Archive Legacy Tables (Tier 1 + Tier 2 Combined)
-- ============================================================================
--
-- Context:
--   Result of NeonDB Schema Audit + Phase 2 Validation & Cleanup Analysis
--   All tables confirmed as legacy/unused with 0 rows (verified 2025-12-10)
--
-- TIER 1 - Easy Win Tables:
--   * calls_november_backup  - Historical backup snapshot, no FKs
--   * posts                  - Superseded by coverage_posts
--   * stations               - Duplicate of posts concept, never used
--   * zones                  - Superseded by response_area_mappings
--   * uploads                - Superseded by parish_uploads
--                              (/api/upload-calls now returns 410 Gone)
--
-- TIER 2 - Legacy Exclusion & Zone Tables:
--   * auto_exclusions            - Superseded by exclusion_logs + calls columns
--   * manual_exclusions          - Superseded by exclusion_logs + calls columns
--   * call_exclusion_audit       - Legacy audit, not used by views/runtime
--   * response_zone_geometries   - Child of response_zones, unused
--   * response_zones             - Superseded by response_area_mappings
--   * region_parishes            - Unused; parishes.region is active mapping
--
-- NOT touched (require product decisions):
--   * call_weather_exclusion_audit - Used by stored function
--   * parish_configs family        - Used by views
--   * monthly_metrics family       - Requires review
--
-- Strategy:
--   - Move tables from public → archive schema
--   - Preserve all data and constraints
--   - DO NOT drop or rename tables
--
-- Date: 2025-12-10
-- Verified by: __________________________
--
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS archive;

-- ============================================================================
-- TIER 1: Easy Win Tables
-- ============================================================================

-- calls_november_backup: Historical backup snapshot
ALTER TABLE public.calls_november_backup SET SCHEMA archive;

-- posts: Legacy, superseded by coverage_posts
ALTER TABLE public.posts SET SCHEMA archive;

-- stations: Duplicate of posts concept, never used
ALTER TABLE public.stations SET SCHEMA archive;

-- zones: Legacy, superseded by response_area_mappings
ALTER TABLE public.zones SET SCHEMA archive;

-- uploads: Legacy, superseded by parish_uploads
ALTER TABLE public.uploads SET SCHEMA archive;

-- ============================================================================
-- TIER 2: Legacy Exclusion Tables
-- ============================================================================

-- auto_exclusions: Superseded by exclusion_logs + calls.is_auto_excluded
ALTER TABLE public.auto_exclusions SET SCHEMA archive;

-- manual_exclusions: Superseded by exclusion_logs + calls.is_excluded
ALTER TABLE public.manual_exclusions SET SCHEMA archive;

-- call_exclusion_audit: Legacy detailed audit, not used
ALTER TABLE public.call_exclusion_audit SET SCHEMA archive;

-- ============================================================================
-- TIER 2: Legacy Zone/Region Tables
-- ============================================================================

-- response_zone_geometries: Child of response_zones (move first due to FK)
ALTER TABLE public.response_zone_geometries SET SCHEMA archive;

-- response_zones: Superseded by response_area_mappings
ALTER TABLE public.response_zones SET SCHEMA archive;

-- region_parishes: Unused; parishes.region is active mapping
ALTER TABLE public.region_parishes SET SCHEMA archive;

COMMIT;

-- ============================================================================
-- VERIFICATION (run after migration)
-- ============================================================================
-- SELECT schemaname, tablename FROM pg_tables 
-- WHERE tablename IN (
--   'calls_november_backup','posts','stations','zones','uploads',
--   'auto_exclusions','manual_exclusions','call_exclusion_audit',
--   'response_zone_geometries','response_zones','region_parishes'
-- ) ORDER BY tablename;
-- Expected: all 11 should show schemaname = 'archive'

-- ============================================================================
-- ROLLBACK (manual, if needed)
-- ============================================================================
-- BEGIN;
-- ALTER TABLE archive.calls_november_backup SET SCHEMA public;
-- ALTER TABLE archive.posts SET SCHEMA public;
-- ALTER TABLE archive.stations SET SCHEMA public;
-- ALTER TABLE archive.zones SET SCHEMA public;
-- ALTER TABLE archive.uploads SET SCHEMA public;
-- ALTER TABLE archive.auto_exclusions SET SCHEMA public;
-- ALTER TABLE archive.manual_exclusions SET SCHEMA public;
-- ALTER TABLE archive.call_exclusion_audit SET SCHEMA public;
-- ALTER TABLE archive.response_zone_geometries SET SCHEMA public;
-- ALTER TABLE archive.response_zones SET SCHEMA public;
-- ALTER TABLE archive.region_parishes SET SCHEMA public;
-- COMMIT;
-- ============================================================================

