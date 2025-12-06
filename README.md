# Compliance Dashboard

Internal EMS compliance dashboard for tracking response metrics across parishes and zones.

## Overview
- Next.js app-router frontend with server routes for data access and uploads.
- Reads operational EMS call data from Neon Postgres and surfaces compliance metrics.
- Authenticated access only; routes are protected via NextAuth middleware.

## Tech Stack
- Next.js 16 / React 19
- TypeScript
- Neon Postgres
- NextAuth (Google provider)
- Deployed on Vercel

## Prerequisites
- Node.js 18+
- npm 9+

## Setup
1. Install dependencies:
   ```sh
   npm install
   ```
2. Create a `.env.local` with required environment variables (see below).
3. Run the dev server:
   ```sh
   npm run dev
   ```
4. Production build:
   ```sh
   npm run build && npm start
   ```

## Environment Variables
- `DATABASE_URL` – Neon Postgres connection string.
- `NEXTAUTH_SECRET` – Secret for NextAuth JWT/session encryption.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` – OAuth credentials.
- `DEV_BYPASS_AUTH` / `LOCAL_DEV_BYPASS` – Optional development-only bypass flags; must stay off in staging/production.
- `ORS_API_KEY`, `GEOAPIFY_API_KEY` – External API keys used by specific routes.
- `BLOB_READ_WRITE_TOKEN` – Required if using Vercel Blob uploads.
- `NEXT_PUBLIC_ORS_API_KEY` – Public-facing key for client requests to ORS where applicable.

## Testing and Linting
- Lint: `npm run lint`

## Deployment Notes
- Target: Vercel, using the Next.js app router output.
- Ensure all environment variables are configured in Vercel project settings.
- Neon database should be reachable with SSL; `rejectUnauthorized` is disabled for Neon compatibility.

## Data Sources
- Production data comes from EMS call exports ingested via CSV uploads.
- No production data is stored in this repository.
