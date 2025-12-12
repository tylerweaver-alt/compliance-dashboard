/**
 * GET /api/calls/exclusion-audit
 * 
 * Unified Exclusion Audit endpoint - returns BOTH manual and auto exclusions
 * for display in the Audit Log tab.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool } from '@/lib/db';

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

    // Fetch ALL excluded calls (both manual and auto)
    const result = await client.query(`
      SELECT
        c.id,
        c.response_number,
        c.response_date,
        c.radio_name,
        c.origin_address,
        c.response_area,
        c.exclusion_type,
        c.exclusion_reason,
        c.excluded_at,
        c.excluded_by_user_id,
        el.id as log_id,
        el.strategy_key,
        el.created_by_email,
        el.engine_metadata,
        p.name as parish_name,
        u.email as excluded_by_email,
        u.full_name as excluded_by_name
      FROM calls c
      LEFT JOIN exclusion_logs el ON el.call_id = c.id
        AND el.reverted_at IS NULL
      LEFT JOIN parishes p ON c.parish_id = p.id
      LEFT JOIN users u ON c.excluded_by_user_id = u.id
      WHERE c.parish_id = $1
        AND c.exclusion_type IS NOT NULL
        ${dateFilter}
      ORDER BY c.excluded_at DESC NULLS LAST, c.response_number
    `, params);

    // Format the results
    const exclusions = result.rows.map(row => {
      const isAuto = row.exclusion_type === 'AUTO';
      const metadata = row.engine_metadata || {};

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
          type: row.exclusion_type || (isAuto ? 'AUTO' : 'MANUAL'),
          strategy: row.strategy_key || null,
          reason: row.exclusion_reason,
          excludedAt: row.excluded_at,
          excludedBy: isAuto ? 'System (Auto-Exclusion Engine)' : (row.excluded_by_name || row.excluded_by_email || row.created_by_email || 'Unknown'),
          parishName: row.parish_name,
        },
        // Only include windowContext for auto-exclusions
        ...(isAuto && metadata ? {
          windowContext: {
            windowMinutes: metadata.windowMinutes || 45,
            callsInWindow: metadata.callsInWindow || 0,
            callPosition: metadata.callPosition || 0,
            windowCalls: metadata.windowCalls || [],
          }
        } : {}),
      };
    });

    // Separate counts
    const autoCount = exclusions.filter(e => e.exclusion.type === 'AUTO').length;
    const manualCount = exclusions.filter(e => e.exclusion.type === 'MANUAL').length;

    return NextResponse.json({
      ok: true,
      totalExclusions: exclusions.length,
      autoCount,
      manualCount,
      exclusions,
    });
  } catch (error: any) {
    console.error('Error fetching exclusion audit:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exclusion audit', details: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

