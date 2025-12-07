# Compliance Dashboard

[![CI](https://github.com/tylerweaver-alt/compliance-dashboard/actions/workflows/ci.yml/badge.svg)](https://github.com/tylerweaver-alt/compliance-dashboard/actions/workflows/ci.yml)
[![CodeQL](https://github.com/tylerweaver-alt/compliance-dashboard/actions/workflows/codeql.yml/badge.svg)](https://github.com/tylerweaver-alt/compliance-dashboard/actions/workflows/codeql.yml)

Internal EMS compliance dashboard for tracking response metrics across parishes and zones.

## Overview

This application provides real-time visibility into EMS response compliance metrics:
- **Dashboard tiles** showing compliance status by parish with red/yellow/green indicators
- **Zone-based compliance evaluation** with configurable thresholds per response area
- **Auto-exclusion engine** for weather events, peak load, and CAD outages
- **Heatmap visualization** of call density and response times
- **CSV upload** for ingesting EMS call data from external systems
- **Role-based access control** for regional managers, directors, and admins

## Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS |
| Language | TypeScript (strict mode) |
| Database | Neon Postgres (with PostGIS) |
| Auth | NextAuth.js (Google OAuth) |
| Hosting | Vercel |
| Monitoring | Sentry |
| Maps | Leaflet, React-Leaflet |
| Charts | Recharts |

## Prerequisites

- **Node.js** 18.x or higher
- **npm** 9.x or higher
- Access to a Neon Postgres database
- Google OAuth credentials (for authentication)

## Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/compliance-dashboard.git
   cd compliance-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your values
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open** [http://localhost:3000](http://localhost:3000)

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues automatically |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check code formatting |
| `npm run typecheck` | Run TypeScript type checking |
| `npm test` | Run tests |

## Environment Variables

Copy `.env.example` to `.env.local` and configure:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `NEXTAUTH_SECRET` | Yes | JWT encryption secret |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `ORS_API_KEY` | No | OpenRouteService API key |
| `GEOAPIFY_API_KEY` | No | Geoapify geocoding API key |
| `BLOB_READ_WRITE_TOKEN` | No | Vercel Blob storage token |
| `CRON_SECRET` | No | Cron job authentication |

⚠️ **Never commit `.env.local` or any file containing secrets.**

## Project Structure

```
compliance-dashboard/
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── components/        # React components
│   ├── AcadianDashboard/  # Main dashboard
│   └── ...
├── lib/                   # Core business logic
│   ├── autoExclusions/    # Auto-exclusion engine
│   ├── compliance/        # Compliance helpers
│   ├── db.ts             # Database connection
│   └── ...
├── db/migrations/         # SQL migrations
├── docs/                  # Documentation
└── types/                 # TypeScript definitions
```

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) - System design and data flow
- [Data Model](./docs/DATA_MODEL.md) - Database schema and tables
- [Deployment](./docs/DEPLOYMENT.md) - Deployment guide
- [Security](./docs/SECURITY.md) - Security architecture
- [Contributing](./CONTRIBUTING.md) - Contribution guidelines

## Deployment

Production deployments are managed via Vercel:
1. Push to `main` triggers automatic deployment
2. Environment variables must be configured in Vercel project settings
3. See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for details

## Security

- See [SECURITY.md](./SECURITY.md) for vulnerability reporting
- All routes are protected by NextAuth middleware
- Role-based access control for admin functions
- CodeQL and Dependabot enabled for security scanning

## License

[MIT](./LICENSE)
