// app/api/calls/[id]/weather-matches/route.ts
// API for fetching weather exclusion details for a specific call

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Pool } from 'pg';
import { authOptions } from '../../../auth/[...nextauth]/route';

export const runtime = 'nodejs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const callId = parseInt(id, 10);

  if (isNaN(callId)) {
    return NextResponse.json({ error: 'Invalid call ID' }, { status: 400 });
  }

  const client = await pool.connect();

  try {
    // Get call exclusion details
    const callRes = await client.query(`
      SELECT 
        id,
        is_excluded,
        exclusion_reason,
        is_auto_excluded,
        auto_exclusion_reason,
        auto_exclusion_strategy,
        is_any_excluded,
        is_weather_excluded
      FROM calls_with_exclusions
      WHERE id = $1
    `, [callId]);

    if (callRes.rowCount === 0) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    const call = callRes.rows[0];

    // Get weather matches from audit table
    const weatherRes = await client.query(`
      SELECT
        weather_event_id,
        weather_event_type,
        weather_severity,
        weather_area_desc,
        overlap_start,
        overlap_end,
        extra,
        created_at
      FROM call_weather_exclusion_audit
      WHERE call_id = $1
      ORDER BY created_at DESC
    `, [callId]);

    return NextResponse.json({
      call: {
        id: call.id,
        is_excluded: call.is_excluded,
        exclusion_reason: call.exclusion_reason,
        is_auto_excluded: call.is_auto_excluded,
        auto_exclusion_reason: call.auto_exclusion_reason,
        auto_exclusion_strategy: call.auto_exclusion_strategy,
        is_any_excluded: call.is_any_excluded,
        is_weather_excluded: call.is_weather_excluded,
      },
      weatherMatches: weatherRes.rows,
    });
  } catch (err: any) {
    console.error('Error fetching weather matches:', err);
    return NextResponse.json(
      { error: 'Failed to fetch weather matches', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

