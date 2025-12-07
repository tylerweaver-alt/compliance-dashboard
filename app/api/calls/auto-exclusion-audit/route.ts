/**
 * GET /api/calls/auto-exclusion-audit
 * 
 * Fetch auto-exclusion audit data for display in the Audit Log tab.
 * Returns auto-excluded calls with their window context (related calls, positions, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parishId = searchParams.get('parish_id');
  const startDate = searchParams.get('start');
  const endDate = searchParams.get('end');

  if (!parishId) {
    return NextResponse.json({ error: 'parish_id is required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Build date filter
    let dateFilter = '';
    const params: any[] = [parishId];

    if (startDate && endDate) {
      dateFilter = `
        AND to_date(c.response_date, 'MM/DD/YYYY') >= $2::date
        AND to_date(c.response_date, 'MM/DD/YYYY') <= $3::date
      `;
      params.push(startDate, endDate);
    }

    // Fetch auto-excluded calls with PEAK_CALL_LOAD strategy
    const result = await client.query(`
      SELECT 
        c.id,
        c.response_number,
        c.response_date,
        c.radio_name,
        c.origin_address,
        c.response_area,
        c.auto_exclusion_strategy,
        c.auto_exclusion_reason,
        c.auto_excluded_at,
        c.auto_exclusion_metadata,
        el.id as log_id,
        el.engine_metadata,
        el.created_at as excluded_at,
        p.name as parish_name
      FROM calls c
      LEFT JOIN exclusion_logs el ON el.call_id = c.id 
        AND el.exclusion_type = 'AUTO' 
        AND el.strategy_key = 'PEAK_CALL_LOAD'
        AND el.reverted_at IS NULL
      LEFT JOIN parishes p ON c.parish_id = p.id
      WHERE c.parish_id = $1
        AND c.is_auto_excluded = TRUE
        AND c.auto_exclusion_strategy = 'PEAK_CALL_LOAD'
        ${dateFilter}
      ORDER BY c.auto_excluded_at DESC, c.response_number
    `, params);

    // Group and format the results
    const autoExclusions = result.rows.map(row => {
      // Parse the metadata
      const metadata = row.auto_exclusion_metadata || row.engine_metadata || {};
      
      return {
        callId: row.id,
        callInfo: {
          responseNumber: row.response_number,
          responseDate: row.response_date,
          unit: row.radio_name,
          address: row.origin_address,
          zone: row.response_area,
        },
        exclusion: {
          strategy: row.auto_exclusion_strategy,
          reason: row.auto_exclusion_reason,
          excludedAt: row.excluded_at || row.auto_excluded_at,
          parishName: row.parish_name || metadata.parishName,
        },
        windowContext: {
          windowMinutes: metadata.windowMinutes || 45,
          callsInWindow: metadata.callsInWindow || 0,
          callPosition: metadata.callPosition || 0,
          firstCallTime: metadata.firstCallTime || null,
          lastCallTime: metadata.lastCallTime || null,
          windowCalls: metadata.windowCalls || [],
          thisCallResponseMinutes: metadata.thisCallResponseMinutes,
          thisCallThresholdMinutes: metadata.thisCallThresholdMinutes,
        },
      };
    });

    return NextResponse.json({
      ok: true,
      totalExclusions: autoExclusions.length,
      autoExclusions,
    });
  } catch (err: any) {
    console.error('Error fetching auto-exclusion audit:', err);
    return NextResponse.json(
      { error: 'Failed to fetch auto-exclusion audit', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

