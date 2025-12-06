# Architecture

## Overview
- Next.js app router front end deployed to Vercel.
- Server routes under `app/api/` handle data access, uploads, and reporting.
- Neon Postgres is the system of record for EMS call data, parish settings, zones, and uploads.
- Authentication via NextAuth (Google provider) with session-aware middleware.

## Data flow
- Client requests hit Vercel edge; middleware enforces authentication and guards most API routes.
- API routes run on the Node.js runtime and connect to Neon using `pg`.
- Call data is ingested via CSV upload, validated, and written to `calls` plus metadata in `parish_uploads`.
- Dashboard views read from aggregated queries (calls, zones, compliance summaries).

## API routes (high level)
- `/api/auth/*` – NextAuth handlers.
- `/api/calls` – Authenticated fetch of call records with date filtering.
- `/api/parish-summary` – Authenticated compliance summary by parish and zone.
- `/api/upload` – Authenticated CSV ingest with role checks, size and type validation.
- Additional routes exist for coverage, zones, stats, admin utilities, and uploads; all are protected by middleware.

## Database access
- `lib/db.ts` exposes a Neon connection pool and a `query` helper for parameterized queries.
- Most routes use the shared pool; some admin utilities rely on the helper.

## Middleware and caching
- `middleware.ts` enforces authentication on all routes except static assets and the `/api/auth` and `/api/health` allowlist.
- The app uses dynamic rendering for authenticated pages; no aggressive edge caching is applied to protected data.

## Dynamic routes
- Route segments under `app/` provide page-level navigation (dashboard, parish reports, uploads).
- API routes under `app/api/` are organized by resource; URL shapes are stable to avoid breaking clients.
