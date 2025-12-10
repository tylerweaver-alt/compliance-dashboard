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
 * - 200 OK with status "healthy" when all core components are UP
 * - 200 OK with status "degraded" when some components have issues
 * - 503 Service Unavailable if critical components are DOWN
 */

import { NextResponse } from 'next/server';
import {
  runAllHealthChecks,
  HEALTH_COMPONENTS,
  mapStatusToText,
  type HealthCheckResult,
} from '@/lib/health';

export const dynamic = 'force-dynamic';

interface PublicHealthComponent {
  id: string;
  name: string;
  status: string;
  statusText: string;
}

/**
 * Compute overall status from component results.
 * Only considers CORE components for overall status.
 */
function computeOverallStatus(results: HealthCheckResult[]): 'healthy' | 'degraded' | 'down' {
  // Core components that affect overall status
  const coreIds = ['NEON_DB', 'AUTH'];
  const coreResults = results.filter((r) => coreIds.includes(r.id));

  const hasDown = coreResults.some((r) => r.status === 'DOWN');
  const hasDegraded = results.some((r) => r.status === 'DEGRADED');

  if (hasDown) return 'down';
  if (hasDegraded) return 'degraded';
  return 'healthy';
}

export async function GET() {
  try {
    const results = await runAllHealthChecks();
    const overall = computeOverallStatus(results);

    // Map to public-safe format (no internal details)
    const components: PublicHealthComponent[] = results.map((r) => {
      const meta = HEALTH_COMPONENTS[r.id];
      return {
        id: r.id,
        name: meta?.name || r.id,
        status: r.status,
        statusText: mapStatusToText(r.status),
      };
    });

    const httpStatus = overall === 'down' ? 503 : 200;

    return NextResponse.json(
      {
        status: overall,
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        components,
      },
      { status: httpStatus }
    );
  } catch (error) {
    console.error('[Health API] Error running health checks:', error);
    return NextResponse.json(
      {
        status: 'down',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        error: 'Health check failed',
      },
      { status: 503 }
    );
  }
}

