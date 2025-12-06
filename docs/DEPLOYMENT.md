# Deployment

## Target
- Vercel deployment using the Next.js app router output.
- Neon Postgres as the primary database.

## Build commands
- Install: `npm install`
- Build: `npm run build`
- Start (production): `npm start`

## Environment configuration
- Set required environment variables in Vercel project settings:
  - `DATABASE_URL`
  - `NEXTAUTH_SECRET`
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
  - `ORS_API_KEY`, `GEOAPIFY_API_KEY`, `BLOB_READ_WRITE_TOKEN` as needed
  - Optional dev-only flags: `DEV_BYPASS_AUTH`, `LOCAL_DEV_BYPASS` (must remain off in staging/production)

## Database setup
- Point `DATABASE_URL` to the Neon instance; SSL is required, with `rejectUnauthorized` disabled for Neon compatibility.
- Run any required migrations or seed scripts before first deploy (not provided in this repo).

## Notes
- Ensure uploads and API routes run on the Node.js runtime (default for server routes).
- Verify Vercel permissions for any blob storage usage if enabled.
