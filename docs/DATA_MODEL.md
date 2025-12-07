# Data Model

## Overview
The application relies on Neon Postgres. Key tables inferred from the codebase:

## Core Tables

### `calls`
Stores individual EMS call records.
- **Core fields**: `id`, `parish_id`, `response_number`, `response_date`, `response_date_time`, `origin_address`, `origin_location_city`, location fields
- **Timestamps**: `call_in_que_time`, `assigned_time`, `enroute_time`, `arrived_at_scene_time`, etc.
- **Compliance fields**: `compliance_time_minutes`, `threshold_minutes`, `is_compliant`
- **Exclusion fields** (Phase 1-2):
  - `is_excluded` (boolean): Whether call is excluded from compliance
  - `exclusion_reason` (text): Reason for exclusion
  - `exclusion_type` (text): 'MANUAL' or 'AUTO'
  - `is_auto_excluded` (boolean): Auto-exclusion flag
  - `auto_exclusion_reason` (text): Auto-exclusion reason
  - `auto_exclusion_strategy` (text): Strategy that triggered exclusion
  - `auto_exclusion_metadata` (jsonb): Additional context
  - `excluded_at` (timestamp): When exclusion was applied
  - `excluded_by_user_id` (integer): User who applied manual exclusion
- Indexed by `parish_id` and date fields for filtering.

### `parish_settings`
Parish-level configuration.
- `parish_id` (integer, PK): Reference to parishes table
- `global_response_threshold_seconds` (integer): Default threshold
- `target_average_response_seconds` (integer): Target average
- `use_zones` (boolean): Whether to use zone-based evaluation
- `exception_keywords` (text[]): Keywords for auto-exclusion
- `report_columns` (text[]): Columns to show in reports
- `response_start_time` (text): 'dispatched', 'received', or 'enroute'
- `target_compliance_percent` (numeric): Target compliance % for dashboard (Phase 4)

### `parish_uploads`
Tracks uploaded CSV files.
- Columns: `id`, `parish_id`, `filename`, `file_size_bytes`, `file_mime_type`, `uploaded_by_user_id`, `uploaded_by_username`, `status`, `rows_imported`, `data_month`, `data_year`.
- Raw file blobs are not stored; only metadata is retained.

### `users`
Backing store for NextAuth user metadata.
- Columns: `id`, `email`, `full_name`, `display_name`, `role`, `is_active`, `is_admin`, `allowed_regions`, `has_all_regions`, timestamps.

### `response_area_mappings`
Zone configuration for compliance calculations.
- `id`, `parish_id`, `response_area` (zone name)
- `threshold_minutes` (numeric): Zone-specific threshold
- `locations` (text[]): Locations mapped to this zone

### `audit_logs`
Records authentication, admin events, and exclusion decisions.
- Columns: `id`, `actor_user_id`, `actor_email`, `action`, `target_type`, `target_id`, `summary`, `metadata`, timestamps.
- Actions include: 'LOGIN', 'LOGOUT', 'MANUAL_EXCLUSION', 'AUTO_EXCLUSION', 'EXCLUSION_REMOVED', etc.

## Migrations
SQL migration scripts are located in `db/migrations/`:
- `auto_exclusions.sql` - Auto-exclusion fields on calls table
- `manual_exclusions.sql` - Manual exclusion and audit log tables
- `target_compliance.sql` - Target compliance % on parish_settings
- `audit_logs.sql` - Audit log table structure

## Notes
- Exact schema definitions, constraints, and indexes are not included in the repository; consult the database migrations or inspect the Neon instance directly for full details.
