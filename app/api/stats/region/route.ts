import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import {
  computeComplianceStats,
  computeResponseTimeDistribution,
  computeDailyTrend,
  computeHourlyVolume,
  formatMinutes,
} from '@/lib/stats';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const regionIdParam = searchParams.get('regionId');
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    if (!regionIdParam) {
      return NextResponse.json({ error: 'regionId is required' }, { status: 400 });
    }

    const regionId = parseInt(regionIdParam, 10);
    if (isNaN(regionId)) {
      return NextResponse.json({ error: 'Invalid regionId' }, { status: 400 });
    }

    // Get region info
    const regionResult = await query(
      'SELECT id, name FROM regions WHERE id = $1',
      [regionId]
    );
    if (regionResult.rows.length === 0) {
      return NextResponse.json({ error: 'Region not found' }, { status: 404 });
    }
    const region = regionResult.rows[0];

    // Get parishes in this region
    const parishesResult = await query(
      `SELECT p.id, p.name FROM parishes p
       JOIN regions r ON p.region = r.name
       WHERE r.id = $1 AND p.is_contracted = true
       ORDER BY p.name`,
      [regionId]
    );
    const parishIds = parishesResult.rows.map((p: any) => p.id);

    if (parishIds.length === 0) {
      return NextResponse.json({
        ok: true,
        region: { id: region.id, name: region.name },
        dateRange: { start: startDate, end: endDate },
        compliance: { totalCalls: 0, includedCalls: 0, excludedCalls: 0, compliantCalls: 0, nonCompliantCalls: 0, compliancePercent: 0, manualExclusions: 0, autoExclusions: 0 },
        outcomes: { totalCalls: 0, priorityCalls: 0, excludedCalls: 0, transports: 0, refusals: 0, cancelled: 0, noPatient: 0, transfusalRate: null },
        responseTimeDistribution: { avgMinutes: null, avgFormatted: '--:--', medianMinutes: null, medianFormatted: '--:--', p75Minutes: null, p75Formatted: '--:--', p90Minutes: null, p90Formatted: '--:--', p95Minutes: null, p95Formatted: '--:--' },
        dailyTrend: [],
        hourlyVolume: [],
        hospitals: [],
        exclusions: [],
        parishBreakdown: [],
      });
    }

    const parishFilter = `parish_id IN (${parishIds.join(',')})`;

    // Build date filter
    const params: any[] = [];
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `
        AND to_date(response_date, 'MM/DD/YYYY') >= $1::date
        AND to_date(response_date, 'MM/DD/YYYY') <= $2::date
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

    // 1. Call Outcome Breakdown (region-wide)
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
      WHERE ${parishFilter} ${dateFilter}
    `;
    const outcomeResult = await query(outcomeSql, params);
    const outcomes = outcomeResult.rows[0];

    // 2. Hospital Flow (top destinations region-wide)
    const hospitalSql = `
      SELECT
        COALESCE(destination_description, 'Unknown') as hospital,
        COUNT(*) as count
      FROM calls
      WHERE ${parishFilter} ${dateFilter}
        AND destination_description IS NOT NULL
        AND destination_description != ''
      GROUP BY destination_description
      ORDER BY count DESC
      LIMIT 10
    `;
    const hospitalResult = await query(hospitalSql, params);

    // 3. Exclusion Reasons (region-wide)
    const exclusionSql = `
      SELECT
        COALESCE(exclusion_reason, 'No reason specified') as reason,
        COUNT(*) as count
      FROM calls
      WHERE ${parishFilter} ${dateFilter}
        AND is_excluded = true
      GROUP BY exclusion_reason
      ORDER BY count DESC
      LIMIT 10
    `;
    const exclusionResult = await query(exclusionSql, params);

    // 4. Parish Breakdown with compliance
    const parishSql = `
      SELECT
        p.id,
        p.name,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE REPLACE(c.priority, '0', '') IN ('1', '2', '3') AND c.arrived_at_scene_time IS NOT NULL) as priority_calls,
        COUNT(*) FILTER (WHERE c.is_excluded = true) as excluded_calls,
        COUNT(*) FILTER (
          WHERE (c.is_excluded = false OR c.is_excluded IS NULL)
          AND REPLACE(c.priority, '0', '') IN ('1', '2', '3')
          AND c.compliance_time_minutes IS NOT NULL
          AND c.compliance_time_minutes <= COALESCE(c.threshold_minutes, 12)
        ) as compliant_calls,
        COUNT(*) FILTER (
          WHERE (c.is_excluded = false OR c.is_excluded IS NULL)
          AND REPLACE(c.priority, '0', '') IN ('1', '2', '3')
          AND c.compliance_time_minutes IS NOT NULL
        ) as evaluated_calls
      FROM calls c
      JOIN parishes p ON c.parish_id = p.id
      WHERE ${parishFilter} ${dateFilter}
      GROUP BY p.id, p.name
      ORDER BY total_calls DESC
    `;
    const parishBreakdownResult = await query(parishSql, params);

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
      .map(h => ({
        hour: h.hour,
        label: `${h.hour.toString().padStart(2, '0')}:00`,
        callCount: h.callCount,
      }));

    return NextResponse.json({
      ok: true,
      region: { id: region.id, name: region.name },
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
      hospitals: hospitalResult.rows.map((r: any) => ({ name: r.hospital, count: parseInt(r.count) })),
      exclusions: exclusionResult.rows.map((r: any) => ({ reason: r.reason, count: parseInt(r.count) })),
      parishBreakdown: parishBreakdownResult.rows.map((r: any) => {
        const evaluated = parseInt(r.evaluated_calls) || 0;
        const compliant = parseInt(r.compliant_calls) || 0;
        return {
          id: r.id,
          name: r.name,
          totalCalls: parseInt(r.total_calls),
          priorityCalls: parseInt(r.priority_calls),
          excludedCalls: parseInt(r.excluded_calls),
          compliancePercent: evaluated > 0 ? Math.round((compliant / evaluated) * 10000) / 100 : null,
        };
      }),
    });
  } catch (err: any) {
    console.error('Error fetching region stats:', err);
    return NextResponse.json({ error: 'Failed to fetch stats', details: err.message }, { status: 500 });
  }
}

