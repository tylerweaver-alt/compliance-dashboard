# Security

## Authentication
- NextAuth with Google provider backs all authenticated sessions.
- `middleware.ts` guards all routes except static assets and the `/api/auth` and `/api/health` allowlist.
- Session tokens are validated via `NEXTAUTH_SECRET`.

## Authorization
- Most API routes require a valid session; upload uses role checks against known admin-like roles.
- Admin-only or elevated routes rely on session user fields (`role`, `is_admin`, region access) populated from Neon.

## Upload handling
- `/api/upload` accepts multipart/form-data with a single CSV file.
- Enforces MIME/extension CSV checks and a 10 MB size cap; returns 413 when exceeded.
- Parses CSV server-side, normalizes call data, writes to `calls`, and stores metadata only in `parish_uploads` (no blobs).
- Fails closed on auth or validation errors.

## Protected routes
- `/api/calls` and `/api/parish-summary` require a session.
- Other routes under `app/api/` are covered by middleware; only `/api/auth/*` and `/api/health` are public.

## Roles
- Admin-like roles include `OM`, `Director`, `VP`, `Admin`; uploads are restricted to these.
- Session enrichment attaches role, region permissions, and admin flags for downstream checks.

## Future improvements
- Add explicit role-based authorization middleware for all write endpoints.
- Rate-limit sensitive routes and uploads.
- Add audit logging for uploads and administrative changes where missing.
- Expand input validation with schema definitions for all payloads.
