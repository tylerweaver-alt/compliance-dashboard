/**
 * Sysadmin Health API
 *
 * GET /api/sysadmin/health
 * Returns health status for all monitored components.
 *
 * Protected by middleware: requires SuperAdmin + IP allowlist.
 *
 * Transition-aware logging: Only logs to sysadmin_log when a component's
 * status changes (e.g., UP → DOWN or DOWN → UP).
 */

import { NextResponse } from 'next/server';
import {
  runAllHealthChecks,
  HEALTH_COMPONENTS,
  mapStatusToText,
  type HealthCheckResult,
  type HealthStatus,
} from '@/lib/health';
import { logHealthStatus } from '@/lib/sysadmin/log';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface HealthResponseItem {
  id: string;
  name: string;
  group: string;
  status: string;
  statusText: string;
  message?: string;
  latencyMs?: number;
  checkedAt: string;
}

interface HealthResponse {
  overall: 'UP' | 'DEGRADED' | 'DOWN';
  checkedAt: string;
  components: HealthResponseItem[];
}

/**
 * Determine overall status from component results.
 */
function computeOverallStatus(results: HealthCheckResult[]): 'UP' | 'DEGRADED' | 'DOWN' {
  const hasDown = results.some((r) => r.status === 'DOWN');
  const hasDegraded = results.some((r) => r.status === 'DEGRADED');

  if (hasDown) return 'DOWN';
  if (hasDegraded) return 'DEGRADED';
  return 'UP';
}

/**
 * Get the most recent health status for a component from sysadmin_log.
 */
async function getPreviousStatus(componentId: string): Promise<HealthStatus | null> {
  try {
    const result = await query(
      `SELECT status FROM sysadmin_log
       WHERE component_id = $1 AND category = 'HEALTH'
       ORDER BY created_at DESC
       LIMIT 1`,
      [componentId]
    );
    if (result.rows.length > 0 && result.rows[0].status) {
      return result.rows[0].status as HealthStatus;
    }
    return null;
  } catch (err) {
    console.error(`[Health] Failed to get previous status for ${componentId}:`, err);
    return null;
  }
}

export async function GET() {
  try {
    const results = await runAllHealthChecks();
    const checkedAt = new Date().toISOString();

    // Map results to response format
    const components: HealthResponseItem[] = results.map((r) => {
      const meta = HEALTH_COMPONENTS[r.id];
      return {
        id: r.id,
        name: meta?.name || r.id,
        group: meta?.group || 'UNKNOWN',
        status: r.status,
        statusText: mapStatusToText(r.status),
        message: r.message,
        latencyMs: r.latencyMs,
        checkedAt: r.checkedAt,
      };
    });

    const overall = computeOverallStatus(results);

    // Transition-aware logging: only log when status changes
    for (const r of results) {
      const previousStatus = await getPreviousStatus(r.id);
      const currentStatus = r.status;
      const currentStatusText = mapStatusToText(currentStatus);

      // Log if: no previous record OR status has changed
      if (previousStatus === null || previousStatus !== currentStatus) {
        const previousStatusText = previousStatus ? mapStatusToText(previousStatus) : null;
        const message = previousStatus === null
          ? `${r.id} initial status: ${currentStatus}`
          : `${r.id} status changed from ${previousStatus} to ${currentStatus}`;

        const level = currentStatus === 'DOWN' ? 'ERROR'
          : currentStatus === 'DEGRADED' ? 'WARN'
          : 'INFO';

        await logHealthStatus(
          r.id,
          currentStatus,
          currentStatusText,
          message,
          {
            previousStatus: previousStatus,
            newStatus: currentStatus,
            previousStatusText: previousStatusText,
            newStatusText: currentStatusText,
            checkedAt: r.checkedAt,
            latencyMs: r.latencyMs,
            ...(r.details || {}),
          }
        );
      }
    }

    const response: HealthResponse = {
      overall,
      checkedAt,
      components,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Sysadmin Health API] Error:', error);
    return NextResponse.json(
      { error: 'Health check failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

