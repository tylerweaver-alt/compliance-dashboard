/**
 * Compliance Feasibility API - Detailed Compliance Curve with Exclusions
 * 
 * POST /api/compliance/feasibility
 * 
 * This endpoint computes feasibility curves with raw/calculated compliance,
 * exclusion metrics, and target intersection calculations.
 * 
 * Input: { regionId, parishId?, zoneId?, startDate?, endDate?, thresholds? }
 * Output: { currentCurve, projectedCurve, summary, metrics, dateRange, regionId, parishId }
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import type {
  FeasibilityRequest,
  FeasibilityResponse,
  FeasibilityPoint,
  FeasibilitySummary,
  ComplianceMetrics,
} from '@/lib/feasibility-types';

export const runtime = 'nodejs';

// Map region codes to DB region names
const REGION_CODE_TO_DB_REGION: Record<string, string> = {
  CENLA: 'Central Louisiana',
  SWLA: 'Southwest Louisiana',
  NOLA: 'New Orleans',
  NELA: 'Northeast Louisiana',
  SELA: 'Southeast Louisiana',
};

// Default target compliance for intersection calculation
const DEFAULT_TARGET_COMPLIANCE = 90;

// Default thresholds in minutes - expanded range to allow target intersection visibility
const DEFAULT_THRESHOLDS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

// Extended thresholds for intersection calculation (up to 60 minutes)
const EXTENDED_THRESHOLDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
  32, 34, 36, 38, 40, 42, 44, 46, 48, 50,
  52, 54, 56, 58, 60
];

// Maximum minutes to search for intersection
const MAX_INTERSECTION_MINUTES = 60;

/**
 * Linear interpolation to find the X value where Y = target
 */
function interpolateTargetMinutes(
  points: { minutes: number; compliance: number }[],
  target: number
): number | null {
  if (points.length < 2) return null;
  
  // Sort by minutes
  const sorted = [...points].sort((a, b) => a.minutes - b.minutes);
  
  // Check if target is reached
  const maxCompliance = Math.max(...sorted.map(p => p.compliance));
  if (maxCompliance < target) return null;
  
  // Find the two points that bracket the target
  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i + 1];
    
    if ((p1.compliance <= target && p2.compliance >= target) ||
        (p1.compliance >= target && p2.compliance <= target)) {
      // Linear interpolation: find x where y = target
      const slope = (p2.compliance - p1.compliance) / (p2.minutes - p1.minutes);
      if (slope === 0) return p1.minutes;
      const targetMinutes = p1.minutes + (target - p1.compliance) / slope;
      return Math.round(targetMinutes * 100) / 100; // Round to 2 decimals
    }
  }
  
  // If we reached target at first point
  if (sorted[0].compliance >= target) {
    return sorted[0].minutes;
  }
  
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as FeasibilityRequest;
    
    // Validate input
    if (!body.regionId) {
      return NextResponse.json({ error: 'regionId is required' }, { status: 400 });
    }

    const { regionId, parishId, startDate, endDate } = body;
    const thresholds = body.thresholds ?? DEFAULT_THRESHOLDS;
    const targetCompliance = body.targetCompliance ?? DEFAULT_TARGET_COMPLIANCE;
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

    // Date range filter
    if (startDate && endDate) {
      whereClauses.push(`to_date(c.response_date, 'MM/DD/YYYY') >= $${paramIndex++}::date`);
      params.push(startDate);
      whereClauses.push(`to_date(c.response_date, 'MM/DD/YYYY') <= $${paramIndex++}::date`);
      params.push(endDate);
    } else {
      // Default: last 90 days
      whereClauses.push(`to_date(c.response_date, 'MM/DD/YYYY') >= CURRENT_DATE - INTERVAL '90 days'`);
    }

    // Require valid response times
    whereClauses.push(`c.arrived_at_scene_time IS NOT NULL`);
    whereClauses.push(`c.call_in_que_time IS NOT NULL`);

    // Only include priority 1, 2, 3 calls
    whereClauses.push(`REPLACE(c.priority, '0', '') IN ('1', '2', '3')`);

    const whereClause = whereClauses.join(' AND ');

    // Query all calls with response time and exclusion status
    const sql = `
      SELECT 
        EXTRACT(EPOCH FROM (
          TO_TIMESTAMP(c.arrived_at_scene_time, 'MM/DD/YY HH24:MI:SS') -
          TO_TIMESTAMP(c.call_in_que_time, 'MM/DD/YY HH24:MI:SS')
        )) / 60 as response_time_minutes,
        to_date(c.response_date, 'MM/DD/YYYY') as call_date,
        COALESCE(c.is_excluded, false) as is_excluded
      FROM calls c
      JOIN parishes p ON c.parish_id = p.id
      WHERE ${whereClause}
    `;

    const result = await query<{
      response_time_minutes: number;
      call_date: string;
      is_excluded: boolean;
    }>(sql, params);

    // Filter valid response times (0-120 minutes)
    const allCalls = result.rows.filter(row =>
      row.response_time_minutes != null &&
      row.response_time_minutes >= 0 &&
      row.response_time_minutes < 120
    );

    // Separate raw and excluded calls
    const rawCalls = allCalls;
    const excludedCalls = allCalls.filter(c => c.is_excluded === true);
    const countedCalls = allCalls.filter(c => c.is_excluded !== true);

    const rawCallCount = rawCalls.length;
    const excludedCallCount = excludedCalls.length;
    const countedCallCount = countedCalls.length;

    // Calculate date range from actual data
    let minDate = '';
    let maxDate = '';
    if (allCalls.length > 0) {
      const dates = allCalls.map(c => c.call_date).filter(Boolean).sort();
      minDate = dates[0] || '';
      maxDate = dates[dates.length - 1] || '';
    }

    // Calculate feasibility points for each threshold
    const currentCurve: FeasibilityPoint[] = thresholds.map(thresholdMinutes => {
      // Raw compliance (all calls, no exclusions)
      const rawCompliant = rawCalls.filter(
        c => c.response_time_minutes <= thresholdMinutes
      ).length;
      const rawCompliance = rawCallCount > 0
        ? Math.round((rawCompliant / rawCallCount) * 1000) / 10
        : 0;

      // Calculated compliance (after exclusions)
      const countedCompliant = countedCalls.filter(
        c => c.response_time_minutes <= thresholdMinutes
      ).length;
      const calculatedCompliance = countedCallCount > 0
        ? Math.round((countedCompliant / countedCallCount) * 1000) / 10
        : 0;

      // Excluded calls at this threshold
      const excludedAtThreshold = excludedCalls.filter(
        c => c.response_time_minutes <= thresholdMinutes
      ).length;

      return {
        minutes: thresholdMinutes,
        expectedCompliance: DEFAULT_TARGET_COMPLIANCE, // Contract target
        rawCompliance,
        calculatedCompliance,
        rawCallCount: rawCompliant,
        excludedCallCount: excludedAtThreshold,
        countedCallCount: countedCompliant,
      };
    });

    // Projected curve: for now, same as current (can be enhanced later)
    const projectedCurve = currentCurve.map(p => ({ ...p }));

    // Calculate extended curve points for intersection calculation (up to 60 minutes)
    // This allows finding intersections beyond the default display thresholds
    const extendedCurvePoints = EXTENDED_THRESHOLDS.map(thresholdMinutes => {
      const countedCompliant = countedCalls.filter(
        c => c.response_time_minutes <= thresholdMinutes
      ).length;
      const calculatedCompliance = countedCallCount > 0
        ? Math.round((countedCompliant / countedCallCount) * 1000) / 10
        : 0;
      return { minutes: thresholdMinutes, compliance: calculatedCompliance };
    });

    // Calculate intersection point for target compliance using extended curve
    const targetMinutesCurrent = interpolateTargetMinutes(
      extendedCurvePoints,
      targetCompliance
    );
    const targetMinutesProjected = interpolateTargetMinutes(
      extendedCurvePoints, // Use same extended curve for projected
      targetCompliance
    );

    // Determine if intersection was found within 60 minutes
    const intersectionFound = targetMinutesCurrent !== null && targetMinutesCurrent <= MAX_INTERSECTION_MINUTES;

    const summary: FeasibilitySummary = {
      targetCompliance,
      targetMinutesCurrent,
      targetMinutesProjected,
      intersection: {
        found: intersectionFound,
        minutes: intersectionFound ? targetMinutesCurrent : null,
      },
    };

    // Overall metrics at a reference threshold (e.g., 8 minutes)
    const refPoint = currentCurve.find(p => p.minutes === 8) || currentCurve[0];
    const metrics: ComplianceMetrics = {
      expectedPercent: targetCompliance,
      rawPercent: refPoint?.rawCompliance ?? 0,
      calculatedPercent: refPoint?.calculatedCompliance ?? 0,
      rawCallCount,
      excludedCallCount,
      countedCallCount,
    };

    const response: FeasibilityResponse = {
      currentCurve,
      projectedCurve,
      summary,
      metrics,
      dateRange: { start: minDate, end: maxDate },
      regionId: regionCode,
      parishId: parishId ?? null,
    };

    return NextResponse.json(response);

  } catch (err: any) {
    console.error('Error in /api/compliance/feasibility:', err);
    return NextResponse.json(
      { error: 'Failed to compute feasibility curve', details: err?.message },
      { status: 500 }
    );
  }
}

