/**
 * Dev Logs API Endpoint
 *
 * Provides calculation verification data for the Dev Logs panel.
 * This endpoint is protected by:
 * 1. NEXT_PUBLIC_SHOW_DEV_LOGS environment variable
 * 2. User role check (admin, superadmin, dev only)
 *
 * Returns:
 * - parishes: Array of parish stats with zone breakdowns and validation flags
 * - auditLogs: Last 20 login/logout events for the current user
 * - dateRange: Current date range with source indicator
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool } from '@/lib/db';
import { countCallsForRegion, ParishStats } from '@/lib/calls/countCalls';

// ============================================================================
// TYPES
// ============================================================================

interface DevLogsParish extends ParishStats {
  sumValid: boolean; // Parish total === sum of zone totals
  complianceValid: boolean; // Compliance % uses correct denominator
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  summary: string;
}

interface DevLogsResponse {
  parishes: DevLogsParish[];
  auditLogs: AuditLogEntry[];
  dateRange: {
    startDate: string;
    endDate: string;
    source: string;
  };
  regionId: number;
  regionName: string;
}

// ============================================================================
// ALLOWED ROLES
// ============================================================================

const ALLOWED_ROLES = ['admin', 'superadmin', 'dev', 'Admin', 'SuperAdmin', 'Dev'];

function isAllowedRole(role: string | undefined): boolean {
  if (!role) return false;
  return ALLOWED_ROLES.includes(role);
}

// ============================================================================
// FEATURE GATE CHECK
// ============================================================================

function isDevLogsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SHOW_DEV_LOGS === 'true';
}

// ============================================================================
// GET HANDLER
// ============================================================================

export async function GET(request: NextRequest) {
  // 1. Check feature gate
  if (!isDevLogsEnabled()) {
    return NextResponse.json({ error: 'Dev Logs feature is disabled' }, { status: 403 });
  }

  // 2. Check authentication
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 3. Check role
  const userRole = (session.user as { role?: string }).role;
  if (!isAllowedRole(userRole)) {
    return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
  }

  // 4. Parse query parameters
  const { searchParams } = new URL(request.url);
  const regionId = searchParams.get('regionId');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const source = searchParams.get('source') || 'unknown';

  if (!regionId || !startDate || !endDate) {
    return NextResponse.json(
      { error: 'Missing required parameters: regionId, startDate, endDate' },
      { status: 400 }
    );
  }

  const numericRegionId = parseInt(regionId, 10);
  if (isNaN(numericRegionId)) {
    return NextResponse.json({ error: 'Invalid regionId' }, { status: 400 });
  }

  try {
    // 5. Get region name
    const regionResult = await pool.query('SELECT name FROM regions WHERE id = $1', [
      numericRegionId,
    ]);
    const regionName = regionResult.rows[0]?.name || `Region ${numericRegionId}`;

    // 6. Get parish stats using canonical counting
    const parishStats = await countCallsForRegion({
      regionId: numericRegionId,
      startDate,
      endDate,
    });

    // 7. Add validation flags to each parish
    const parishes: DevLogsParish[] = parishStats.map((parish) => {
      const zoneTotalSum = parish.zones.reduce((sum, z) => sum + z.totalCalls, 0);
      const zoneCompliantSum = parish.zones.reduce((sum, z) => sum + z.compliantCalls, 0);

      return {
        ...parish,
        sumValid: parish.totalCalls === zoneTotalSum,
        complianceValid:
          parish.totalCalls > 0
            ? parish.compliancePercent === Math.round((zoneCompliantSum / zoneTotalSum) * 100)
            : true,
      };
    });

    // 8. Get audit logs for current user (last 20 login/logout events)
    const userEmail = session.user.email.toLowerCase();
    const auditResult = await pool.query<AuditLogEntry>(
      `SELECT id, created_at as timestamp, action, summary
       FROM audit_logs
       WHERE LOWER(actor_email) = $1
         AND action IN ('LOGIN', 'LOGOUT')
       ORDER BY created_at DESC
       LIMIT 20`,
      [userEmail]
    );

    const auditLogs: AuditLogEntry[] = auditResult.rows.map((row) => ({
      id: row.id,
      timestamp: new Date(row.timestamp).toISOString(),
      action: row.action,
      summary: row.summary,
    }));

    // 9. Build response
    const response: DevLogsResponse = {
      parishes,
      auditLogs,
      dateRange: {
        startDate,
        endDate,
        source,
      },
      regionId: numericRegionId,
      regionName,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[DevLogs API] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
