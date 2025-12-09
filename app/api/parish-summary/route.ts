// Summary API for parish compliance stats; requires authenticated session.
// Phase 2: Uses canonical counting logic from lib/calls/countCalls.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { query, pool } from '@/lib/db';
import { countCallsForParish, type ZoneStats } from '@/lib/calls/countCalls';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const client = await pool.connect();
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parishNameRaw = searchParams.get('parish');
    const startDate = searchParams.get('start'); // YYYY-MM-DD
    const endDate = searchParams.get('end'); // YYYY-MM-DD

    if (!parishNameRaw) {
      return NextResponse.json(
        { error: 'parish query param is required, e.g. ?parish=Evangeline' },
        { status: 400 }
      );
    }

    const parishName = parishNameRaw.trim();

    // Look up parish_id from name (case-insensitive)
    const { rows: parishRows } = await query<{ id: number }>(
      'SELECT id FROM parishes WHERE LOWER(name) = LOWER($1)',
      [parishName]
    );

    if (parishRows.length === 0) {
      return NextResponse.json({ error: `Unknown parish: ${parishName}` }, { status: 400 });
    }

    const parishId = parishRows[0].id;

    // Get date range - use provided dates or auto-detect from data
    let effectiveStartDate = startDate || '';
    let effectiveEndDate = endDate || '';

    if (!effectiveStartDate || !effectiveEndDate) {
      // Auto-detect date range from calls data
      const dateRangeResult = await client.query(
        `
        SELECT
          MIN(to_date(response_date, 'MM/DD/YYYY')) as min_date,
          MAX(to_date(response_date, 'MM/DD/YYYY')) as max_date
        FROM calls
        WHERE parish_id = $1
          AND response_date IS NOT NULL AND response_date != ''
      `,
        [parishId]
      );

      if (dateRangeResult.rows[0]?.min_date) {
        const minDate = new Date(dateRangeResult.rows[0].min_date);
        const maxDate = new Date(dateRangeResult.rows[0].max_date);
        effectiveStartDate = effectiveStartDate || minDate.toISOString().split('T')[0];
        effectiveEndDate = effectiveEndDate || maxDate.toISOString().split('T')[0];
      }
    }

    // Use canonical counting logic
    const canonicalStats = await countCallsForParish(
      {
        parishId,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
      },
      client
    );

    // Map canonical zone stats to response format
    // Maintains backward compatibility with existing response shape
    const zones = (canonicalStats.zones || []).map((z: ZoneStats) => ({
      zone: z.zoneName,
      threshold: z.thresholdMinutes,
      complianceTarget: 90, // Default target - could be fetched from parish_settings
      totalCalls: z.totalCalls,
      compliantCalls: z.compliantCalls,
      complianceRate: z.compliancePercent,
    }));

    return NextResponse.json({
      parish: parishName,
      totalCalls: canonicalStats.totalCalls,
      totalCompliant: canonicalStats.compliantCalls,
      overallRate: canonicalStats.compliancePercent,
      zones,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (err: any) {
    console.error('parish-summary error', err);
    return NextResponse.json(
      {
        error: 'Server error getting parish summary',
        details: err.message || String(err),
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
