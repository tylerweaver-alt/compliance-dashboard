// app/api/calls/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Pool } from 'pg';
import { authOptions } from '../auth/[...nextauth]/route';

export const runtime = 'nodejs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();

  try {
    const { searchParams } = new URL(req.url);

    const parishIdStr = searchParams.get('parish_id');
    const start = searchParams.get('start'); // YYYY-MM-DD (optional)
    const end = searchParams.get('end');     // YYYY-MM-DD (optional)
    const limitStr = searchParams.get('limit');
    const offsetStr = searchParams.get('offset');

    if (!parishIdStr) {
      return NextResponse.json(
        { error: 'parish_id is required' },
        { status: 400 }
      );
    }

    const parishId = parseInt(parishIdStr, 10);
    if (Number.isNaN(parishId)) {
      return NextResponse.json(
        { error: 'parish_id must be a valid integer' },
        { status: 400 }
      );
    }

    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 200, 1000) : 200;
    const offset = offsetStr ? Math.max(parseInt(offsetStr, 10) || 0, 0) : 0;

    const whereClauses: string[] = ['parish_id = $1'];
    const params: any[] = [parishId];
    let paramIndex = 2;

    // We assume response_date is something like MM/DD/YYYY from MicroStrategy.
    // This ONLY affects filtering; returned values remain raw.
    if (start) {
      whereClauses.push(
        `to_date(response_date, 'MM/DD/YYYY') >= $${paramIndex++}`
      );
      params.push(start);
    }

    if (end) {
      whereClauses.push(
        `to_date(response_date, 'MM/DD/YYYY') <= $${paramIndex++}`
      );
      params.push(end);
    }

    params.push(limit);
    const limitParamIndex = paramIndex++;
    params.push(offset);
    const offsetParamIndex = paramIndex++;

    const sql = `
      select
        id,
        parish_id,
        uploaded_at,
        uploaded_by_user_id,

        -- raw CSV-derived fields
        response_number,
        response_date,
        response_date_time,
        radio_name,
        response_area,
        origin_description,
        origin_address,
        origin_location_city,
        origin_zip,
        origin_latitude,
        origin_longitude,
        destination_description,
        destination_address,
        destination_location_city,
        destination_zip,
        caller_type,
        problem_description,
        priority,
        unnamed_col_19,
        transport_mode,
        master_incident_cancel_reason,
        call_in_que_time,
        call_taking_complete_time,
        assigned_time_first_unit,
        assigned_time,
        enroute_time,
        staged_time,
        arrived_at_scene_time,
        depart_scene_time,
        arrived_destination_time,
        call_cleared_time,
        master_incident_delay_reason_description,
        vehicle_assigned_delay_reason,
        cad_is_transport,
        queue_response_time,
        assigned_response_time,
        enroute_response_time,
        assigned_to_arrived_at_scene,
        call_in_queue_to_cleared_call_lag,
        compliance_time,
        raw_row
      from calls
      where ${whereClauses.join(' and ')}
      order by
        -- most recent first by interpreted date, fallback to id
        to_date(response_date, 'MM/DD/YYYY') desc nulls last,
        id desc
      limit $${limitParamIndex}
      offset $${offsetParamIndex}
    `;

    const { rows } = await client.query(sql, params);

    return NextResponse.json({
      parish_id: parishId,
      filters: {
        start,
        end,
        limit,
        offset,
      },
      rowCount: rows.length,
      rows,
    });
  } catch (err: any) {
    console.error('Error fetching calls:', err);
    return NextResponse.json(
      {
        error: 'Failed to fetch calls',
        details: err.message ?? String(err),
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
