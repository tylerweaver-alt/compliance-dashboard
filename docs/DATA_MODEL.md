# Data Model

## Overview
The application relies on Neon Postgres. Key tables inferred from the codebase:

- `calls`: Stores individual EMS call records.
  - Columns include: `id`, `parish_id`, `response_number`, `response_date`, `response_date_time`, `origin_address`, `origin_location_city`, location fields, timestamps for call lifecycle (assigned, enroute, arrived_at_scene, etc.), compliance timing fields, `raw_row`.
  - Supports derived durations such as `queue_response_time`, `assigned_response_time`, `enroute_response_time`, and compliance markers.
  - Indexed by `parish_id` and date fields for filtering (indexes not visible in repo).

- `parish_uploads`: Tracks uploaded CSV files.
  - Columns include: `id`, `parish_id`, `filename`, `file_size_bytes`, `file_mime_type`, `uploaded_by_user_id`, `uploaded_by_username`, `status`, `rows_imported`, `data_month`, `data_year`.
  - Raw file blobs are not stored; only metadata is retained.

- `users`: Backing store for NextAuth user metadata.
  - Columns: `id`, `email`, `full_name`, `display_name`, `role`, `is_active`, `is_admin`, `allowed_regions`, `has_all_regions`, timestamps.

- `zones`: Used for compliance calculations by parish and zone.
  - Columns include `id`, `parish_id`, `name`, `threshold_minutes`, `compliance_target`, flags for exclusions.

- `audit_logs`: Records authentication and admin events.
  - Columns: `id`, `actor_user_id`, `actor_email`, `action`, `target_type`, `target_id`, `summary`, `metadata`, timestamps.

## Notes
- Exact schema definitions, constraints, and indexes are not included in the repository; consult the database migrations or inspect the Neon instance directly for full details.
