# Sysadmin Console Documentation

## Overview

The Sysadmin Console provides SuperAdmin users with system monitoring, audit log access, and administrative capabilities.

## Access Requirements

### Who Can Access
Only SuperAdmin users can access the sysadmin console:
- `tyler.weaver@acadian.com`
- `jrc7192@gmail.com`

### Security Checks
Access requires passing ALL of the following:
1. **Authentication**: Valid NextAuth session
2. **SuperAdmin Status**: Email must be in the SuperAdmin list
3. **IP Allowlist**: Request IP must be in `SYSADMIN_IP_ALLOWLIST`

Failed access attempts are logged to the audit log.

## Configuration

### Environment Variables

```bash
# Required for sysadmin access
SYSADMIN_IP_ALLOWLIST=192.168.1.1,10.0.0.0/8,your.office.ip

# If not set, ALL sysadmin access is denied
```

### IP Allowlist Format
- Single IPs: `192.168.1.1`
- CIDR ranges: `10.0.0.0/8`
- Multiple entries: Comma-separated

## API Endpoints

### GET /api/sysadmin/audit-events

Returns paginated audit log entries.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| from | ISO date | Filter events after this date |
| to | ISO date | Filter events before this date |
| category | string | Filter by category (AUTH, CALLS, etc.) |
| actor | email | Filter by actor email |
| targetType | string | Filter by target type |
| limit | number | Max results (1-500, default 100) |
| offset | number | Pagination offset (default 0) |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "created_at": "2024-12-10T12:00:00Z",
      "actor_email": "user@acadian.com",
      "actor_role": "Admin",
      "category": "AUTH",
      "action": "LOGIN_SUCCESS",
      "target_email": "user@acadian.com",
      "target_id": null,
      "details": { "provider": "google" }
    }
  ],
  "pagination": {
    "total": 1000,
    "limit": 100,
    "offset": 0,
    "hasMore": true
  }
}
```

**Rate Limiting:** 30 requests per minute

## Audit Log Categories

| Category | Description | Example Actions |
|----------|-------------|-----------------|
| AUTH | Authentication events | LOGIN_SUCCESS, LOGOUT, LOGIN_DENIED |
| CALLS | Call data operations | CSV_UPLOAD, CALL_EDITED |
| EXCLUSIONS | Exclusion management | AUTO_EXCLUSION, MANUAL_EXCLUSION |
| AUDIT | Audit log access | AUDIT_LOGS_VIEWED |
| CONFIG | Configuration changes | USER_UPSERT, REGION_UPDATE |
| DB | Database operations | MIGRATION_RUN |
| SYSTEM | System events | RATE_LIMIT_HIT, SYSADMIN_ACCESS_DENIED |

## UI Components

### Sysadmin Button
- Only visible to SuperAdmin users
- Located in the main navigation
- Opens the sysadmin console

### Console Features
- **Health Cards**: System health status
- **Downtime Info**: Current/scheduled downtime
- **Activity Logs**: Recent audit events

## Security Considerations

### Read-Only by Default
The current sysadmin console is read-only. It displays:
- Health status
- Downtime information
- Audit logs

### Future Destructive Actions
If destructive actions are added in the future:
1. API must live under `/api/sysadmin/...`
2. Must use SuperAdmin + IP allowlist middleware
3. Must log to audit_logs with category `SYSTEM`
4. UI must require step-up confirmation (e.g., "Type your email to confirm")

## Troubleshooting

### "Access Denied" Error
1. Verify your email is in the SuperAdmin list
2. Check that `SYSADMIN_IP_ALLOWLIST` includes your IP
3. Check audit logs for `SYSADMIN_ACCESS_DENIED` events

### Rate Limited
- Wait for the rate limit window to reset (1 minute)
- Check `Retry-After` header for exact wait time

### No Data Returned
- Verify the audit_logs table has data
- Check your filter parameters
- Ensure the date range is valid

