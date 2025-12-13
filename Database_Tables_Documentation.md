# Neon Database Tables - Complete Documentation

## Table Breakdown

| **Table Name** | **Description** |
|----------------|-----------------|
| **audit_logs** | General audit logging table that tracks all system actions and changes. Records who performed what action, when it occurred, and on which target (users, regions, areas, uploads, etc.). Includes metadata for detailed tracking of system events and administrative activities. |
| **calls** | Core table storing all EMS call records. Contains comprehensive call data including response numbers, dates/times, addresses, locations (lat/long), radio names, response areas, priorities, problem descriptions, and all timestamp fields for the call lifecycle (received, dispatched, enroute, staged, on scene, departed, arrived, cleared). Also includes calculated response times, compliance metrics, exclusion flags (manual and auto), weather exclusion data, and the raw CSV row data. This is the primary operational data table. |
| **call_exclusions** | Tracks manual exclusions of calls from compliance calculations. Stores which calls were excluded, who excluded them, when, and the reason for exclusion. Links to the calls table and users table to maintain a complete audit trail of exclusion decisions. |
| **compliance_configs** | Stores compliance configuration settings for parishes. Defines response time targets, required compliance percentages, and zone-specific thresholds. Supports versioning to track changes over time. Used to determine whether calls meet contractual obligations. |
| **data_uploads** | Tracks all CSV file uploads into the system. Records upload metadata including filename, file size, upload timestamp, user who uploaded, processing status, number of rows imported, any error messages, and the data month/year the upload represents. Provides complete upload history and troubleshooting information. |
| **parish_zone_contract_status** | Materialized view or reporting table that aggregates compliance data by parish and zone for each month. Shows total calls, included/excluded calls, on-time vs late calls, compliance percentage, and contract status (Met/Not Met). Used for monthly compliance reporting and contract performance tracking. |
| **parishes** | Master table of all parishes (counties) in the system. Contains parish name, region assignment, contract status, place type classification, and logo URL for branding. Core reference table used throughout the application for filtering and organizing data. |
| **policy_rule_actions** | Defines actions to be executed when policy rules are triggered. Actions can include changing staffing levels, moving units between posts/parishes, or sending notifications. Each action has a type, target, execution order, and optional message. Part of the automated policy engine for resource management. |
| **policy_rule_conditions** | Defines the conditions that must be met for policy rules to trigger. Conditions can check various metrics (call volume, response times, unit availability) against target values using operators (equals, greater than, less than). Multiple conditions can be combined with AND/OR logic. |
| **policy_rules** | Master table for the policy engine. Each rule has a name, description, priority, active status, and auto-execute flag. Rules belong to a region and can be enabled/disabled. When conditions are met, associated actions are executed. Used for automated resource allocation and operational decision-making. |
| **raster_columns** | PostGIS system table that catalogs raster data columns in the database. Stores metadata about raster datasets including spatial reference system (SRID), scale, block size, number of bands, pixel types, and spatial extent. Part of the PostGIS extension for handling geographic raster data. |
| **raster_overviews** | PostGIS system table that manages raster overview (pyramid) layers for improved performance when displaying large raster datasets at different zoom levels. Links overview tables to their source raster tables with overview factors. Part of the PostGIS extension. |
| **red_zone_status** | Reporting table that identifies zones in "red zone" status - meaning they are failing to meet compliance requirements. Shows compliance percentage, late percentage, contract status, and red zone severity level. Used for alerting and prioritizing operational improvements. |
| **regions** | Master table of geographic regions (e.g., "Central Louisiana", "North Louisiana"). Each region contains multiple parishes. Includes display order for UI presentation and creation timestamp. Used for organizing parishes and controlling user access permissions. |
| **response_area_mappings** | Maps response zones/areas to parishes and defines their geographic boundaries. Stores zone names, threshold response times (in minutes), location coordinates for zone centers, and GeoJSON boundary polygons. Critical for determining which calls belong to which zones and for compliance calculations. |
| **spatial_ref_sys** | PostGIS system table that stores spatial reference system definitions. Contains SRID (Spatial Reference ID), authority name/ID, and projection definitions in both WKT (Well-Known Text) and PROJ4 formats. Required for geographic coordinate transformations and spatial operations. |
| **sysadmin_log** | System administration logging table for tracking system-level events, errors, warnings, and status changes. Records category, component ID, status, severity level, message, actor email, source, and detailed JSON metadata. Used for system monitoring, debugging, and operational oversight. |
| **time_edit_logs** | Audit trail for all edits made to call timestamp fields. Records which call was edited, which field was changed, old and new values, who made the edit, when it occurred, the reason for the change, and a complete snapshot of the call before editing. Includes edit session IDs to group related changes. Critical for data integrity and accountability. |
| **user_supervision** | Defines supervisor-subordinate relationships between users. Links supervisor user IDs to subordinate user IDs. Used for hierarchical access control and reporting structures within the organization. |
| **users** | Master user table storing all system users. Contains authentication details (email), profile information (full name, display name), role assignments, active status, region access permissions, and admin/superadmin flags. Controls who can access the system and what they can see/do. Includes internal user flag for Acadian employees vs client users. |
| **weather_alerts_normalized** | Normalized version of weather alert data from the National Weather Service. Stores alert details including NWS ID, event type, severity, certainty, urgency, affected areas, start/end times, and GeoJSON polygons for alert boundaries. Used for automatic call exclusions during severe weather events. Includes both raw JSON and parsed fields. |
| **weather_events** | Primary table for storing weather event data from NWS and other sources. Similar structure to weather_alerts_normalized but may include additional event types. Contains event metadata, geographic boundaries, temporal information, and raw JSON for complete data preservation. Used for weather-based auto-exclusion logic. |
| **zones** | Geographic zone definitions with PostGIS geometry data. Links zones to parishes and stores the actual geometric boundaries (polygons) for spatial queries. Used for determining if call locations fall within specific zones and for map visualizations. |

---

## Key Relationships

- **calls** → **parishes** (via parish_id)
- **calls** → **response_area_mappings** (via response_area name)
- **calls** → **call_exclusions** (one-to-many)
- **calls** → **time_edit_logs** (one-to-many)
- **parishes** → **regions** (via region name)
- **parishes** → **zones** (one-to-many)
- **users** → **regions** (via allowed_regions array)
- **users** → **user_supervision** (supervisor/subordinate relationships)
- **policy_rules** → **policy_rule_conditions** (one-to-many)
- **policy_rules** → **policy_rule_actions** (one-to-many)
- **response_area_mappings** → **parishes** (via parish_id)
- **zones** → **parishes** (via parish_id)

---

## Critical Tables for Core Functionality

1. **calls** - All operational data
2. **parishes** - Geographic organization
3. **response_area_mappings** - Zone definitions and thresholds
4. **compliance_configs** - Contract requirements
5. **users** - Access control
6. **time_edit_logs** - Data integrity audit trail
7. **weather_alerts_normalized** - Auto-exclusion logic

---

*Generated: December 2024*

