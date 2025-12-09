import { NextRequest, NextResponse } from 'next/server';
import { query, pool } from '@/lib/db';
import {
  computeComplianceStats,
  computeResponseTimeDistribution,
  computeDailyTrend,
  computeHourlyVolume,
} from '@/lib/stats';
import { countCallsForParish, type ZoneStats } from '@/lib/calls/countCalls';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parishIdParam = searchParams.get('parishId');
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    if (!parishIdParam) {
      return NextResponse.json({ error: 'parishId is required' }, { status: 400 });
    }

    const parishId = parseInt(parishIdParam, 10);
    if (isNaN(parishId)) {
      return NextResponse.json({ error: 'Invalid parishId' }, { status: 400 });
    }

    // Get parish info
    const parishResult = await query('SELECT id, name, region FROM parishes WHERE id = $1', [
      parishId,
    ]);
    if (parishResult.rows.length === 0) {
      return NextResponse.json({ error: 'Parish not found' }, { status: 404 });
    }
    const parish = parishResult.rows[0];

    // Build filters
    const parishFilter = `parish_id = $1`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const params: any[] = [parishId];
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `
        AND to_date(response_date, 'MM/DD/YYYY') >= $2::date
        AND to_date(response_date, 'MM/DD/YYYY') <= $3::date
      `;
      params.push(startDate, endDate);
    }

    // Compute enhanced metrics using helpers
    const [compliance, responseTimeDistribution, dailyTrend, hourlyVolume] = await Promise.all([
      computeComplianceStats(parishFilter, dateFilter, params),
      computeResponseTimeDistribution(parishFilter, dateFilter, params),
      computeDailyTrend(parishFilter, dateFilter, params),
      computeHourlyVolume(parishFilter, dateFilter, params),
    ]);

    // 1. Call Outcome Breakdown
    const outcomeSql = `
      SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE REPLACE(priority, '0', '') IN ('1', '2', '3') AND arrived_at_scene_time IS NOT NULL) as priority_calls,
        COUNT(*) FILTER (WHERE is_excluded = true) as excluded_calls,
        COUNT(*) FILTER (WHERE LOWER(cad_is_transport) = 'yes' OR LOWER(cad_is_transport) = 'true') as transports,
        COUNT(*) FILTER (WHERE LOWER(cad_is_transport) = 'no' OR LOWER(cad_is_transport) = 'false') as refusals,
        COUNT(*) FILTER (WHERE master_incident_cancel_reason IS NOT NULL AND master_incident_cancel_reason != '') as cancelled,
        COUNT(*) FILTER (WHERE destination_description IS NULL OR destination_description = '') as no_patient
      FROM calls
      WHERE parish_id = $1 ${dateFilter}
    `;
    const outcomeResult = await query(outcomeSql, params);
    const outcomes = outcomeResult.rows[0];

    // 2. Hospital Flow (top destinations)
    const hospitalSql = `
      SELECT
        COALESCE(destination_description, 'Unknown') as hospital,
        COUNT(*) as count
      FROM calls
      WHERE parish_id = $1 ${dateFilter}
        AND destination_description IS NOT NULL
        AND destination_description != ''
      GROUP BY destination_description
      ORDER BY count DESC
      LIMIT 10
    `;
    const hospitalResult = await query(hospitalSql, params);

    // 3. Exclusion Reasons
    const exclusionSql = `
      SELECT
        COALESCE(exclusion_reason, 'No reason specified') as reason,
        COUNT(*) as count
      FROM calls
      WHERE parish_id = $1 ${dateFilter}
        AND is_excluded = true
      GROUP BY exclusion_reason
      ORDER BY count DESC
      LIMIT 10
    `;
    const exclusionResult = await query(exclusionSql, params);

    // 4. Zone Breakdown with compliance - using canonical counting logic
    // Phase 2: Uses lib/calls/countCalls.ts for consistent counting
    const client = await pool.connect();
    let canonicalZones: ZoneStats[] = [];
    try {
      const canonicalStats = await countCallsForParish(
        {
          parishId,
          startDate: startDate || '',
          endDate: endDate || '',
        },
        client
      );
      canonicalZones = canonicalStats.zones || [];
    } finally {
      client.release();
    }

    // Calculate transfusal rate: totalCalls / (transports + refusals)
    const totalCalls = parseInt(outcomes.total_calls) || 0;
    const transports = parseInt(outcomes.transports) || 0;
    const refusals = parseInt(outcomes.refusals) || 0;
    const denom = transports + refusals;
    const transfusalRate = denom > 0 ? Math.round((totalCalls / denom) * 100) / 100 : null;

    // Find peak hours (top 3 busiest)
    const peakHours = [...hourlyVolume]
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, 3)
      .map((h) => ({
        hour: h.hour,
        label: `${h.hour.toString().padStart(2, '0')}:00`,
        callCount: h.callCount,
      }));

    return NextResponse.json({
      ok: true,
      parish: { id: parish.id, name: parish.name, region: parish.region },
      dateRange: { start: startDate, end: endDate },
      compliance,
      outcomes: {
        totalCalls,
        priorityCalls: parseInt(outcomes.priority_calls) || 0,
        excludedCalls: parseInt(outcomes.excluded_calls) || 0,
        transports,
        refusals,
        cancelled: parseInt(outcomes.cancelled) || 0,
        noPatient: parseInt(outcomes.no_patient) || 0,
        transfusalRate,
      },
      responseTimeDistribution,
      dailyTrend,
      hourlyVolume,
      peakHours,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      hospitals: hospitalResult.rows.map((r: any) => ({
        name: r.hospital,
        count: parseInt(r.count),
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      exclusions: exclusionResult.rows.map((r: any) => ({
        reason: r.reason,
        count: parseInt(r.count),
      })),
      // Zone breakdown using canonical counting logic
      zones: canonicalZones.map((z: ZoneStats) => ({
        name: z.zoneName,
        total: z.totalCalls,
        active: z.totalCalls, // Canonical counting already excludes is_excluded calls
        compliancePercent: z.compliancePercent,
      })),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error('Error fetching parish stats:', err);
    return NextResponse.json(
      { error: 'Failed to fetch stats', details: err.message },
      { status: 500 }
    );
  }
}
