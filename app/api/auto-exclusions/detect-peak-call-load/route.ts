/**
 * POST /api/auto-exclusions/detect-peak-call-load
 * 
 * Detect and apply PEAK_CALL_LOAD auto-exclusions for calls.
 * 
 * Accepts either:
 * - { parishId, startDate, endDate } for batch processing
 * - { callId } for single call evaluation
 * 
 * Returns: { eligible, flaggedForReview, excluded }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool } from '@/lib/db';
import { peakCallLoadStrategy } from '@/lib/autoExclusions/strategies/peakCallLoad';
import type { AutoExclusionContext } from '@/lib/autoExclusions/types';
import type { PeakCallLoadMetadata } from '@/lib/autoExclusions/strategies/peakCallLoad';

export const runtime = 'nodejs';

interface DetectRequest {
  parishId?: number;
  startDate?: string;
  endDate?: string;
  callId?: number;
  applyExclusions?: boolean;
}

export async function POST(req: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: DetectRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { parishId, startDate, endDate, callId, applyExclusions = false } = body;

  // Validate input
  if (!callId && !parishId) {
    return NextResponse.json(
      { error: 'Either callId or parishId is required' },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  
  try {
    // Get calls to evaluate
    let callsToEvaluate: any[];

    if (callId) {
      // Single call mode
      const result = await client.query(
        `SELECT id, response_number, parish_id, region_id, response_area,
                response_date_time, compliance_time_minutes
         FROM calls WHERE id = $1`,
        [callId]
      );
      callsToEvaluate = result.rows;
    } else {
      // Batch mode - get out-of-compliance calls in parish/date range
      let dateFilter = '';
      const params: any[] = [parishId];

      if (startDate && endDate) {
        dateFilter = `
          AND to_date(response_date, 'MM/DD/YYYY') >= $2::date
          AND to_date(response_date, 'MM/DD/YYYY') <= $3::date
        `;
        params.push(startDate, endDate);
      }

      const result = await client.query(
        `SELECT id, response_number, parish_id, region_id, response_area,
                response_date_time, compliance_time_minutes
         FROM calls
         WHERE parish_id = $1
           AND is_excluded = FALSE
           AND is_auto_excluded = FALSE
           ${dateFilter}
         ORDER BY response_date_time ASC`,
        params
      );
      callsToEvaluate = result.rows;
    }

    const eligible: any[] = [];
    const excluded: any[] = [];

    // Evaluate each call
    for (const call of callsToEvaluate) {
      const context: AutoExclusionContext = {
        callId: call.id,
        responseNumber: call.response_number,
        responseDateTime: new Date(call.response_date_time || Date.now()),
        complianceTimeSeconds: (call.compliance_time_minutes ?? 0) * 60,
        responseArea: call.response_area || '',
        parishId: call.parish_id,
        regionId: call.region_id,
      };

      const result = await peakCallLoadStrategy.evaluate(context);
      if (!result) continue;

      const metadata = result.metadata as PeakCallLoadMetadata;
      eligible.push({ call, result });

      if (metadata.decision === 'AUTO_EXCLUDE') {
        excluded.push({ call, result });
      }
    }

    // Apply exclusions if requested
    if (applyExclusions && excluded.length > 0) {
      await client.query('BEGIN');
      
      try {
        for (const item of excluded) {
          const { call, result } = item;
          const metadata = result.metadata as PeakCallLoadMetadata;

          // Update the call record
          await client.query(
            `UPDATE calls SET
              is_excluded = TRUE,
              is_auto_excluded = TRUE,
              exclusion_type = 'AUTO',
              auto_exclusion_strategy = 'PEAK_CALL_LOAD',
              auto_exclusion_reason = $2,
              auto_excluded_at = NOW(),
              auto_exclusion_metadata = $3
            WHERE id = $1`,
            [call.id, result.reason, JSON.stringify(metadata)]
          );

          // Insert into exclusion_logs
          await client.query(
            `INSERT INTO exclusion_logs (
              call_id, exclusion_type, strategy_key, reason, engine_metadata
            ) VALUES ($1, 'AUTO', 'PEAK_CALL_LOAD', $2, $3)`,
            [call.id, result.reason, JSON.stringify(metadata)]
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    return NextResponse.json({
      ok: true,
      evaluated: callsToEvaluate.length,
      eligible: eligible.length,
      excluded: excluded.map(e => ({
        callId: e.call.id,
        responseNumber: e.call.response_number,
        reason: e.result.reason,
      })),
      applied: applyExclusions,
    });
  } catch (error: any) {
    console.error('Error detecting peak call load:', error);
    return NextResponse.json(
      { error: 'Failed to detect peak call load', details: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

