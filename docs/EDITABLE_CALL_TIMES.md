# Editable Call Times Feature

## Overview

All call time fields (Rcvd, Disp, Enrt, Stgd, OnScn, Dept, Arvd, Avail) are now **editable** with full audit logging. When any call time is edited, the change is automatically logged to the audit trail with details about what changed, who made the change, and why.

## Features

### ✅ Editable Time Fields

The following call time columns are now editable:

| Column | Label | Database Field | Description |
|--------|-------|----------------|-------------|
| **Rcvd** | Received | `call_in_que_time` | Call received time |
| **Disp** | Dispatched | `assigned_time` | Unit dispatched time |
| **Enrt** | Enroute | `enroute_time` | Unit enroute time |
| **Stgd** | Staged | `staged_time` | Unit staged time |
| **OnScn** | On Scene | `arrived_at_scene_time` | Arrived at scene time |
| **Dept** | Departed | `depart_scene_time` | Departed scene time |
| **Arvd** | Arrived | `arrived_destination_time` | Arrived at destination time |
| **Avail** | Available | `call_cleared_time` | Call cleared / available time |

### ✅ Full Audit Trail

Every time edit is logged to the `time_edit_logs` table with:

- **Old Value** - The original timestamp
- **New Value** - The updated timestamp
- **Reason** - User-provided explanation for the change
- **Editor Info** - Who made the change (email, name, role)
- **Timestamp** - When the change was made
- **Call Snapshot** - Complete call data before the edit
- **Edit Session ID** - Groups multiple edits made together

### ✅ Audit Log Display

Time edits appear in the **Audit Log** panel with:

- Field name and label (e.g., "Received", "Dispatched")
- Old time → New time (color-coded: red → green)
- Reason for the change
- Editor name and timestamp
- Grouped by call for easy review

## How to Use

### Editing a Call Time

1. **Click on any time field** in the call details table
   - Time fields show a pencil icon (✎) on hover
   - Click the time value to open the edit modal

2. **Enter the new time value**
   - Format: `MM/DD/YY HH:MM:SS` (e.g., `10/31/25 21:45:51`)
   - The current value is displayed for reference

3. **Provide a reason** (required)
   - Explain why the time is being changed
   - Examples:
     - "Corrected data entry error"
     - "Updated based on CAD system correction"
     - "Adjusted per supervisor review"

4. **Save the change**
   - Click "Save Change" to apply
   - The table will refresh to show the updated time
   - The audit log will update to show the edit

### Viewing Edit History

1. **Open the Audit Log panel**
   - Click the "Audit Log" tab at the top of the page
   - Shows count of time edits (e.g., "2 Time Edits")

2. **Review time edits**
   - Each call with edits is listed separately
   - Shows all fields that were changed
   - Displays old → new values with color coding
   - Includes editor name and reason

## Technical Implementation

### API Endpoint

**POST** `/api/calls/update-times`

**Request Body:**
```json
{
  "callId": 12345,
  "updates": {
    "received": "10/31/25 21:45:51",
    "dispatched": "10/31/25 21:46:30"
  },
  "reason": "Corrected data entry error"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Updated 2 field(s): Received, Dispatched",
  "changedFields": ["Received", "Dispatched"],
  "editSessionId": "uuid-here"
}
```

### Database Schema

**Table:** `time_edit_logs`

```sql
CREATE TABLE time_edit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id integer NOT NULL,
  field_name varchar NOT NULL,
  old_value text,
  new_value text,
  call_snapshot_before jsonb NOT NULL,
  edited_by_user_id uuid,
  edited_by_email varchar NOT NULL,
  edited_by_name varchar,
  edited_by_role varchar,
  reason text NOT NULL,
  metadata jsonb,
  edit_session_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### UI Components

1. **TimeEditModal** - Modal dialog for editing times
   - Shows current value
   - Input for new value with format hint
   - Required reason textarea
   - Cancel/Save buttons

2. **Editable Time Cells** - Table cells with edit functionality
   - Hover effect with pencil icon
   - Click to open edit modal
   - Visual feedback on hover

3. **Audit Log Panel** - Displays edit history
   - Groups edits by call
   - Color-coded old → new values
   - Shows editor and reason

## Security & Permissions

- ✅ **Authentication Required** - Must be logged in to edit times
- ✅ **Audit Trail** - All changes are logged with user info
- ✅ **Reason Required** - Cannot save without explanation
- ✅ **Transaction Safety** - Database transactions ensure data integrity
- ✅ **Snapshot Preservation** - Original call data is preserved

## Benefits

1. **Data Correction** - Fix data entry errors easily
2. **Transparency** - Full audit trail of all changes
3. **Accountability** - Know who changed what and why
4. **Compliance** - Maintain accurate response time data
5. **Flexibility** - Update any time field as needed

## Example Use Cases

### Scenario 1: Data Entry Error
- **Issue:** Dispatcher entered wrong time for "Enroute"
- **Action:** Click Enrt field, enter correct time, reason: "Corrected data entry error"
- **Result:** Time updated, audit log shows the correction

### Scenario 2: CAD System Correction
- **Issue:** CAD system had incorrect "On Scene" time
- **Action:** Click OnScn field, enter corrected time, reason: "Updated based on CAD system correction"
- **Result:** Time updated, change logged for review

### Scenario 3: Supervisor Review
- **Issue:** Multiple times need adjustment after supervisor review
- **Action:** Edit each field with reason: "Adjusted per supervisor review"
- **Result:** All changes grouped in audit log with same edit session ID

## Files Modified

- `app/calls/page.jsx` - Added editable time columns and TimeEditModal
- `app/api/calls/update-times/route.ts` - API endpoint for updating times
- `app/api/calls/time-edits/route.ts` - Existing endpoint for fetching edit history

## Future Enhancements

- [ ] Bulk edit multiple calls at once
- [ ] Export audit log to CSV
- [ ] Filter audit log by date range or editor
- [ ] Undo/revert time changes
- [ ] Email notifications for time edits
- [ ] Role-based permissions (who can edit)

## Summary

✅ **All call times are now editable**  
✅ **Full audit trail with reasons**  
✅ **Easy-to-use modal interface**  
✅ **Automatic audit log updates**  
✅ **Secure and transaction-safe**  

The system maintains complete transparency and accountability for all time changes while making it easy to correct errors and maintain accurate compliance data.

