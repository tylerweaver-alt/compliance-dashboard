# Security Architecture

## Authentication

### NextAuth with Google OAuth
- All users must authenticate via Google OAuth
- Domain restriction: Only `@acadian.com` emails are allowed by default
- External allowlist: `jrc7192@gmail.com` is explicitly allowed via `OWNER_EXCEPTION_EMAIL`
- `middleware.ts` guards all routes except static assets and the `/api/auth` and `/api/health` allowlist
- Session tokens are validated via `NEXTAUTH_SECRET`

### SuperAdmin Access
- SuperAdmin users: `tyler.weaver@acadian.com`, `jrc7192@gmail.com`
- SuperAdmins have access to `/sysadmin` routes
- SuperAdmin routes require both authentication AND IP allowlist verification
- See `lib/auth/requireSuperAdmin.ts`

## Authorization

### Role-Based Access Control
- Roles: `OM`, `Director`, `VP`, `Admin`, `OS`, `PFS`
- Admin roles (`OM`, `Director`, `VP`, `Admin`) can upload CSV data
- Region-based access: Users can only see data for their assigned regions
- `has_all_regions` flag grants access to all regions
- Session enrichment attaches role, region permissions, and admin flags

## Security Headers

Applied to all routes via `next.config.ts`:

| Header | Value | Purpose |
|--------|-------|---------|
| X-Frame-Options | DENY | Prevent clickjacking |
| X-Content-Type-Options | nosniff | Prevent MIME sniffing |
| Referrer-Policy | strict-origin-when-cross-origin | Control referrer information |
| X-XSS-Protection | 1; mode=block | XSS protection (legacy browsers) |
| Strict-Transport-Security | max-age=31536000; includeSubDomains | Force HTTPS |
| Content-Security-Policy | Restrictive policy | Restrict resource loading |

## Rate Limiting

In-memory rate limiting via `lib/security/rate-limiter.ts`:

| Endpoint Type | Max Requests | Window |
|---------------|--------------|--------|
| Auth (`/api/auth/*`) | 10 | 1 minute |
| Upload (`/api/upload`) | 20 | 1 minute |
| Sysadmin (`/api/sysadmin/*`) | 30 | 1 minute |
| General API | 100 | 1 minute |

Rate limit hits are logged to the audit log.

## IP Allowlist

Sysadmin routes require IP allowlist verification via `lib/security/ip-allowlist.ts`:

1. Set `SYSADMIN_IP_ALLOWLIST` environment variable
2. Format: Comma-separated IPs or CIDR ranges
3. Example: `192.168.1.1,10.0.0.0/8`

If no allowlist is configured, all sysadmin access is denied.

## Audit Logging

Centralized audit logging via `lib/audit/logAuditEvent.ts`:

### Categories
- `AUTH`: Login, logout, access denied
- `CALLS`: Call data edits, CSV uploads
- `EXCLUSIONS`: Auto/manual exclusions
- `AUDIT`: Audit log access
- `CONFIG`: Parish, region, user CRUD
- `DB`: Schema changes, critical DB operations
- `SYSTEM`: Cron errors, rate limits, health-check failures

### Logged Events
- All login/logout events
- CSV uploads with row counts
- Sysadmin access (successful and denied)
- Rate limit hits
- Configuration changes

## Upload Handling

- `/api/upload` accepts multipart/form-data with a single CSV file
- Enforces MIME/extension CSV checks and a 10 MB size cap; returns 413 when exceeded
- Uses batch inserts for efficiency (500 rows per batch)
- Parses CSV server-side, normalizes call data, writes to `calls`
- Stores metadata only in `parish_uploads` (no blobs)
- All uploads are logged to audit log
- Fails closed on auth or validation errors

## Input Validation

Zod-based validation via `lib/validations/`:

- Common schemas: `positiveInt`, `email`, `uuid`, `dateString`
- Per-route schemas for API validation
- Consistent error responses via `lib/validations/errors.ts`

## Error Handling

Centralized error handling via `lib/api-errors.ts`:

- `AppError` class for typed errors with status codes
- `handleApiError` for consistent error responses
- Sentry integration for unknown errors
- No internal details leaked to clients

## Sentry Configuration

- `sendDefaultPii: false` - No PII sent to Sentry
- Production trace sampling: 10%
- Email addresses are scrubbed from events via `beforeSend`

## Database Security

- All queries use parameterized statements via `lib/db.ts`
- Connection pooling with timeouts (30s statement timeout)
- Foreign key constraints on critical tables
- Indexes for performance (prevent DoS via slow queries)
- Batch inserts for large operations via `lib/db-batch.ts`

## Environment Variables

### Required (Production)
- `DATABASE_URL`: Neon Postgres connection string
- `NEXTAUTH_SECRET`: Session encryption secret
- `NEXTAUTH_URL`: Application URL

### Recommended (Production)
- `CRON_SECRET`: Secret for cron job authentication
- `SENTRY_DSN`: Sentry error tracking
- `SYSADMIN_IP_ALLOWLIST`: IP allowlist for sysadmin routes

### Security-Sensitive
- `OWNER_EXCEPTION_EMAIL`: External email allowlist for non-@acadian.com users
