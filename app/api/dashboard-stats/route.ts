import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { countCallsForParish, type ZoneStats } from '@/lib/calls/countCalls';

export const runtime = 'nodejs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(req: NextRequest) {
  const client = await pool.connect();

  try {
    const { searchParams } = new URL(req.url);
    let startDate = searchParams.get('start'); // YYYY-MM-DD
    let endDate = searchParams.get('end'); // YYYY-MM-DD
    const autoDetect = searchParams.get('autoDetect') === 'true';
    const regionIdParam = searchParams.get('regionId');
    const regionId = regionIdParam ? parseInt(regionIdParam, 10) : null;

    // Get contracted parishes for this region first (we need them for filtering)
    const parishesQuery = regionId
      ? `SELECT p.id, p.name FROM parishes p JOIN regions r ON p.region = r.name WHERE r.id = $1 AND p.is_contracted = true ORDER BY p.name`
      : `SELECT id, name FROM parishes WHERE is_contracted = true ORDER BY name`;
    const parishesResult = await client.query(parishesQuery, regionId ? [regionId] : []);

    // Build parish ID to name/key mapping
    const parishIdToKey: Record<number, string> = { 0: 'other' };
    const parishNames: Record<string, string> = { other: 'Other Areas' };
    const regionParishIds: number[] = [];
    for (const row of parishesResult.rows) {
      const key = row.name.toLowerCase().replace(/\s+/g, '_');
      parishIdToKey[row.id] = key;
      parishNames[key] = row.name;
      regionParishIds.push(row.id);
    }

    // Build region filter using parish_ids (works even if region_id is null in calls table)
    // This filters calls by their parish_id which belongs to the selected region
    const regionFilter =
      regionId && regionParishIds.length > 0
        ? `AND parish_id IN (${regionParishIds.join(',')})`
        : '';

    // If autoDetect, get the actual date range from the data (for this region)
    if (autoDetect || !startDate || !endDate) {
      const dateRangeResult = await client.query(`
        SELECT
          MIN(to_date(response_date, 'MM/DD/YYYY')) as min_date,
          MAX(to_date(response_date, 'MM/DD/YYYY')) as max_date
        FROM calls
        WHERE response_date IS NOT NULL AND response_date != ''
        ${regionFilter}
      `);

      if (dateRangeResult.rows[0]?.min_date) {
        const minDate = new Date(dateRangeResult.rows[0].min_date);
        const maxDate = new Date(dateRangeResult.rows[0].max_date);
        startDate = minDate.toISOString().split('T')[0];
        endDate = maxDate.toISOString().split('T')[0];
      }
    }

    // Fetch parish-level target compliance for display
    const parishSettingsResult = await client.query(`
      SELECT parish_id, COALESCE(target_compliance_percent, 90.0) as target_compliance_percent
      FROM parish_settings
    `);

    // Build map of parish_id -> target compliance
    const parishTargetCompliance: Record<number, number> = {};
    for (const row of parishSettingsResult.rows) {
      parishTargetCompliance[row.parish_id] = parseFloat(row.target_compliance_percent) || 90.0;
    }

    // =========================================================================
    // CANONICAL CALL COUNTING (Phase 2 Migration)
    // Uses lib/calls/countCalls.ts for consistent counting across all views
    // =========================================================================

    // Build response object with parish keys
    const stats: Record<
      string,
      {
        id: number;
        name: string;
        overall: number | null;
        totalCalls: number;
        compliantCalls: number;
        nonCompliantCalls: number;
        excludedCalls: number;
        targetCompliancePercent: number;
        areas: Array<{ name: string; compliance: number; calls: number }>;
      }
    > = {};

    // Initialize all parishes (from DB) with zero values
    for (const [key, name] of Object.entries(parishNames)) {
      // Find the parish id from the reverse mapping
      const parishId = Object.entries(parishIdToKey).find(([id, k]) => k === key)?.[0];
      const parishIdNum = parseInt(parishId || '0');
      stats[key] = {
        id: parishIdNum,
        name,
        overall: key === 'other' ? null : 0,
        totalCalls: 0,
        compliantCalls: 0,
        nonCompliantCalls: 0,
        excludedCalls: 0,
        targetCompliancePercent: parishTargetCompliance[parishIdNum] ?? 90.0,
        areas: [],
      };
    }

    // Use canonical counting for each parish
    // This ensures consistent counting across Dashboard, Reports, and Dev Logs
    for (const parish of parishesResult.rows) {
      const key = parishIdToKey[parish.id];
      if (!key || !stats[key]) continue;

      // Call canonical counting function
      const canonicalStats = await countCallsForParish(
        {
          parishId: parish.id,
          startDate: startDate || '',
          endDate: endDate || '',
        },
        client
      );

      // Map canonical stats to dashboard response shape
      stats[key].totalCalls = canonicalStats.totalCalls;
      stats[key].compliantCalls = canonicalStats.compliantCalls;
      stats[key].nonCompliantCalls = canonicalStats.totalCalls - canonicalStats.compliantCalls;
      // Note: excludedCalls is not tracked by canonical counting (excluded calls are filtered out)
      // We keep it at 0 for backward compatibility - excluded calls are not counted at all
      stats[key].excludedCalls = 0;

      // Map zone stats to areas array
      if (canonicalStats.zones && canonicalStats.zones.length > 0) {
        stats[key].areas = canonicalStats.zones.map((zone: ZoneStats) => ({
          name: zone.zoneName,
          compliance: zone.compliancePercent,
          calls: zone.totalCalls,
        }));
      }

      // Set overall compliance (one decimal place to match radial gauge)
      if (canonicalStats.totalCalls > 0) {
        stats[key].overall = Math.round(canonicalStats.compliancePercent * 10) / 10;
      }
    }

    // Get last upload info for this region
    const lastUploadResult = await client.query(`
      SELECT uploaded_at, uploaded_by_user_id
      FROM calls
      WHERE 1=1 ${regionFilter}
      ORDER BY uploaded_at DESC
      LIMIT 1
    `);

    let lastUpdated = null;
    if (lastUploadResult.rows.length > 0) {
      const row = lastUploadResult.rows[0];
      lastUpdated = {
        date: new Date(row.uploaded_at).toLocaleDateString(),
        time: new Date(row.uploaded_at).toLocaleTimeString(),
        user: row.uploaded_by_user_id || 'System',
      };
    }

    return NextResponse.json({
      ok: true,
      stats,
      lastUpdated,
      filters: { startDate, endDate },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error('Error fetching dashboard stats:', err);
    return NextResponse.json(
      { error: 'Failed to fetch stats', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
