/**
 * Health check endpoint for uptime monitoring.
 * 
 * This endpoint is public (no authentication required) and can be used by:
 * - Load balancers
 * - Uptime monitoring services (e.g., Better Uptime, Pingdom)
 * - Kubernetes liveness/readiness probes
 * - CI/CD deployment verification
 * 
 * Returns:
 * - 200 OK with status "healthy" when the service is running
 * - 503 Service Unavailable if there are issues
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
    },
    { status: 200 }
  );
}

