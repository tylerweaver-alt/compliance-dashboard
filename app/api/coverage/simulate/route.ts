/**
 * Coverage Simulation API - Baseline Compliance Curve Computation
 * 
 * POST /api/coverage/simulate
 * 
 * This endpoint computes a baseline compliance curve for a region/parish
 * using the existing calls table. It calculates what percentage of calls
 * were responded to within various time thresholds.
 * 
 * Input: { regionId, parishId?, thresholds: [6, 8, 10, 12] }
 * Output: { regionId, parishId, thresholds, baseline: { overallComplianceByThreshold, totalCalls, dateRange } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type { 
  CoverageSimulationRequest, 
  CoverageSimulationResult,
  CompliancePoint 
} from '@/lib/coverage-sim-types';

export const runtime = 'nodejs';

// Map region codes to DB region names (same as heatmap/calls)
const REGION_CODE_TO_DB_REGION: Record<string, string> = {
  CENLA: 'Central Louisiana',
  SWLA: 'Southwest Louisiana',
  NOLA: 'New Orleans',
  NELA: 'Northeast Louisiana',
  SELA: 'Southeast Louisiana',
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as CoverageSimulationRequest;
    
    // Validate input
    if (!body.regionId) {
      return NextResponse.json({ error: 'regionId is required' }, { status: 400 });
    }
    if (!body.thresholds || !Array.isArray(body.thresholds) || body.thresholds.length === 0) {
      return NextResponse.json({ error: 'thresholds must be a non-empty array of numbers' }, { status: 400 });
    }
    if (!body.thresholds.every(t => typeof t === 'number' && t > 0)) {
      return NextResponse.json({ error: 'All thresholds must be positive numbers' }, { status: 400 });
    }

    const { regionId, parishId, thresholds } = body;
    const regionCode = regionId.toUpperCase();
    const dbRegion = REGION_CODE_TO_DB_REGION[regionCode] ?? regionId;

    // Build WHERE clauses
    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Filter by region via parish join
    whereClauses.push(`p.region = $${paramIndex++}`);
    params.push(dbRegion);

    // Optional parish filter
    if (parishId) {
      whereClauses.push(`c.parish_id = $${paramIndex++}`);
      params.push(parishId);
    }

    // Limit to last 90 days
    whereClauses.push(`to_date(c.response_date, 'MM/DD/YYYY') >= CURRENT_DATE - INTERVAL '90 days'`);

    // Require valid response times (both timestamps must exist)
    whereClauses.push(`c.arrived_at_scene_time IS NOT NULL`);
    whereClauses.push(`c.call_in_que_time IS NOT NULL`);

    // Only include priority 1, 2, 3 calls (standard for compliance)
    whereClauses.push(`REPLACE(c.priority, '0', '') IN ('1', '2', '3')`);

    const whereClause = whereClauses.join(' AND ');

    // Query to get all calls with computed response time in minutes
    // Response Time = On Scene Time - Call in Queue Time
    const sql = `
      SELECT 
        EXTRACT(EPOCH FROM (
          TO_TIMESTAMP(c.arrived_at_scene_time, 'MM/DD/YY HH24:MI:SS') -
          TO_TIMESTAMP(c.call_in_que_time, 'MM/DD/YY HH24:MI:SS')
        )) / 60 as response_time_minutes,
        to_date(c.response_date, 'MM/DD/YYYY') as call_date
      FROM calls c
      JOIN parishes p ON c.parish_id = p.id
      WHERE ${whereClause}
    `;

    const result = await query<{ response_time_minutes: number; call_date: string }>(sql, params);
    
    const calls = result.rows.filter(row => 
      row.response_time_minutes != null && 
      row.response_time_minutes >= 0 &&
      row.response_time_minutes < 120 // Filter out unreasonable times (>2 hours)
    );

    const totalCalls = calls.length;

    // Calculate date range from actual data
    let minDate = '';
    let maxDate = '';
    if (calls.length > 0) {
      const dates = calls.map(c => c.call_date).filter(Boolean).sort();
      minDate = dates[0] || '';
      maxDate = dates[dates.length - 1] || '';
    }

    // Calculate compliance for each threshold
    const overallComplianceByThreshold: CompliancePoint[] = thresholds.map(thresholdMinutes => {
      if (totalCalls === 0) {
        return { minutes: thresholdMinutes, compliance: 0 };
      }
      
      const compliantCalls = calls.filter(
        c => c.response_time_minutes <= thresholdMinutes
      ).length;
      
      const compliance = (compliantCalls / totalCalls) * 100;
      
      return {
        minutes: thresholdMinutes,
        compliance: Math.round(compliance * 10) / 10, // Round to 1 decimal
      };
    });

    const response: CoverageSimulationResult = {
      regionId: regionCode,
      parishId: parishId ?? null,
      thresholds,
      baseline: {
        overallComplianceByThreshold,
        totalCalls,
        dateRange: {
          start: minDate,
          end: maxDate,
        },
      },
    };

    return NextResponse.json(response);

  } catch (err: any) {
    console.error('Error in /api/coverage/simulate:', err);
    return NextResponse.json(
      { error: 'Failed to compute compliance simulation', details: err?.message },
      { status: 500 }
    );
  }
}

