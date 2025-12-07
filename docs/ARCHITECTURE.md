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

## Repository Layout

```
compliance-dashboard/
├── app/                          # Next.js App Router pages and API routes
│   ├── AcadianDashboard/         # Main dashboard with parish tiles
│   ├── AcadianIntelligence/      # AI/analytics features
│   ├── api/                      # API routes (see below)
│   ├── calls/                    # Call details page
│   ├── components/               # Shared React components
│   ├── heatmap/                  # Heatmap visualization
│   ├── parish-report/            # Parish compliance reports
│   ├── stats/                    # Statistics pages (region/parish)
│   └── lib/                      # App-specific constants
├── lib/                          # Core business logic
│   ├── autoExclusions/           # Auto-exclusion engine and strategies
│   ├── compliance/               # Compliance status helpers
│   ├── exclusions/               # Manual exclusion helpers
│   ├── stats/                    # Statistics computation helpers
│   └── db.ts                     # Database connection pool
├── db/migrations/                # SQL migration scripts
├── docs/                         # Documentation
├── scripts/                      # Utility scripts
│   └── legacy/                   # Deprecated scripts (kept for reference)
├── data/                         # Static data definitions
└── types/                        # TypeScript type definitions
```

## Core Features

### Compliance Engine
- Zone-based compliance evaluation with configurable thresholds per zone
- Target compliance % per parish (configurable in Parish Settings)
- Dashboard tiles show actual vs target with red/yellow/green status indicators

### Exclusions System
- **Auto-Exclusions** (`lib/autoExclusions/`): Pluggable strategy engine for automatic exclusion
  - Peak Load strategy
  - Weather/Natural Disaster strategy
  - CAD/System Outage strategy
- **Manual Exclusions** (`lib/exclusions/`): User-initiated exclusions with reason capture
- All exclusions are audit-logged for compliance reporting

### Statistics & Analytics
- Region and Parish-level statistics pages
- Compliance trends over time (daily)
- Response time distribution (percentiles)
- Hourly call volume analysis
- Peak hour identification

## API routes (high level)
- `/api/auth/*` – NextAuth handlers.
- `/api/calls` – Authenticated fetch of call records with date filtering.
- `/api/dashboard-stats` – Dashboard tile data with compliance and target %.
- `/api/parish-summary` – Authenticated compliance summary by parish and zone.
- `/api/parish-settings` – Parish configuration including target compliance %.
- `/api/stats/region` – Region-level statistics with trends and distributions.
- `/api/stats/parish` – Parish-level statistics.
- `/api/upload` – Authenticated CSV ingest with role checks, size and type validation.
- Additional routes exist for coverage, zones, admin utilities, and uploads; all are protected by middleware.

## Database access
- `lib/db.ts` exposes a Neon connection pool and a `query` helper for parameterized queries.
- Most routes use the shared pool; some admin utilities rely on the helper.

## Middleware and caching
- `middleware.ts` enforces authentication on all routes except static assets and the `/api/auth` and `/api/health` allowlist.
- The app uses dynamic rendering for authenticated pages; no aggressive edge caching is applied to protected data.

## Dynamic routes
- Route segments under `app/` provide page-level navigation (dashboard, parish reports, uploads).
- API routes under `app/api/` are organized by resource; URL shapes are stable to avoid breaking clients.
