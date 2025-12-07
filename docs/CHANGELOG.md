# Changelog

## 2025-12-06 Editable Time Columns Feature

### Time Field Editing with Audit Logging
- All time columns on Call Details page are now editable (click to edit)
- **Editable fields**: Received, Dispatched, Enroute, Staged, On Scene, Depart, Arrived, Available
- **Response time** is now calculated/read-only (derived from underlying editable times)
- Required reason for all time edits (enforced by modal)
- Full audit trail stored in `time_edit_logs` table

### Permission Control
- Only OM, Director, VP, and Admin roles can edit time fields
- Permission check in both frontend (modal) and backend (API)

### Audit Log Features
- Stores full call snapshot before edit for complete audit trail
- Groups related edits by session ID
- Records: field name, old value, new value, reason, user, timestamp
- Supports metadata for weather alerts and system context

### Files Created
- `db/migrations/time_edit_logs.sql` - Time edit audit log table
- `app/api/calls/[callId]/edit-time/route.ts` - Edit time field API
- `app/api/calls/[callId]/edit-history/route.ts` - Get edit history API

### Files Modified
- `app/calls/page.jsx` - Added EditTimeModal component, marked time columns as editable

---

## 2025-12-06 Phase 1-5 Implementation

### Phase 1: Auto-Exclusion Engine
- Created `lib/autoExclusions/` module with pluggable strategy architecture
- Implemented strategies: Peak Load, Weather/Natural Disaster, CAD Outage
- Added database fields for auto-exclusion tracking (`is_auto_excluded`, `auto_exclusion_reason`, etc.)
- Engine entry point: `runAutoExclusionsForCall(context)`

### Phase 2: Manual Exclusions & Audit Log
- Enhanced Call Details page with exclusion flag indicators
- Added reason capture modal for manual exclusions
- Created `lib/exclusions/` module for exclusion management
- Implemented audit log data model for compliance tracking
- Database migration: `db/migrations/manual_exclusions.sql`

### Phase 3: Statistics Page Redesign
- Created `lib/stats/` module with reusable computation helpers
- Redesigned Region and Parish statistics pages with modern UI
- Added compliance trend charts (daily)
- Added response time distribution (percentiles: 50th, 75th, 90th, 95th)
- Added hourly call volume analysis with peak hour identification
- Integrated Recharts for data visualization

### Phase 4: Target Compliance %
- Added `target_compliance_percent` field to `parish_settings` table
- Created `lib/compliance/status.ts` for compliance status calculation
- Updated Parish Settings modal with Target Compliance % input
- Dashboard tiles now show actual vs target with color indicators:
  - Green: Meeting or exceeding target
  - Yellow: Within 5 percentage points of target
  - Red: More than 5 points below target

### Phase 5: Repository Cleanup
- Updated ARCHITECTURE.md with repository layout and feature documentation
- Organized lib/ into domain-specific modules
- Documented all new features in changelog

## 2025-12-05 Cleanup
- Added project documentation: README, ARCHITECTURE, SECURITY, DEPLOYMENT, DATA_MODEL.
- Moved unused check scripts to `scripts/legacy` and documented them in LEGACY_FILES.
- Added inline comments to critical middleware and API/auth/db files for IT review.
