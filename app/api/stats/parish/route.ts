import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(req: NextRequest) {
  const client = await pool.connect();

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
    const parishResult = await client.query(
      'SELECT id, name, region FROM parishes WHERE id = $1',
      [parishId]
    );
    if (parishResult.rows.length === 0) {
      return NextResponse.json({ error: 'Parish not found' }, { status: 404 });
    }
    const parish = parishResult.rows[0];

    // Build date filter
    const params: any[] = [parishId];
    let dateFilter = '';
    if (startDate && endDate) {
      dateFilter = `
        AND to_date(response_date, 'MM/DD/YYYY') >= $2::date
        AND to_date(response_date, 'MM/DD/YYYY') <= $3::date
      `;
      params.push(startDate, endDate);
    }

    // 1. Call Outcome Breakdown
    // Note: Using cad_is_transport and master_incident_cancel_reason columns instead of disposition
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
    const outcomeResult = await client.query(outcomeSql, params);
    const outcomes = outcomeResult.rows[0];

    // 2. Time & Performance
    const timeSql = `
      SELECT
        AVG(EXTRACT(EPOCH FROM (
          TO_TIMESTAMP(arrived_at_scene_time, 'MM/DD/YY HH24:MI:SS') -
          TO_TIMESTAMP(call_in_que_time, 'MM/DD/YY HH24:MI:SS')
        )) / 60) as avg_response_minutes,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY
          EXTRACT(EPOCH FROM (
            TO_TIMESTAMP(arrived_at_scene_time, 'MM/DD/YY HH24:MI:SS') -
            TO_TIMESTAMP(call_in_que_time, 'MM/DD/YY HH24:MI:SS')
          )) / 60
        ) as median_response_minutes,
        PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY
          EXTRACT(EPOCH FROM (
            TO_TIMESTAMP(arrived_at_scene_time, 'MM/DD/YY HH24:MI:SS') -
            TO_TIMESTAMP(call_in_que_time, 'MM/DD/YY HH24:MI:SS')
          )) / 60
        ) as p90_response_minutes
      FROM calls
      WHERE parish_id = $1 ${dateFilter}
        AND arrived_at_scene_time IS NOT NULL
        AND call_in_que_time IS NOT NULL
        AND REPLACE(priority, '0', '') IN ('1', '2', '3')
    `;
    const timeResult = await client.query(timeSql, params);
    const timeStats = timeResult.rows[0];

    // 3. Hospital Flow (top destinations)
    // Note: Using destination_description column instead of destination_name
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
    const hospitalResult = await client.query(hospitalSql, params);

    // 4. Exclusion Reasons
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
    const exclusionResult = await client.query(exclusionSql, params);

    // 5. Zone Breakdown
    const zoneSql = `
      SELECT
        COALESCE(response_area, 'Unassigned') as zone,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE NOT COALESCE(is_excluded, false)) as active
      FROM calls
      WHERE parish_id = $1 ${dateFilter}
        AND arrived_at_scene_time IS NOT NULL
        AND REPLACE(priority, '0', '') IN ('1', '2', '3')
      GROUP BY response_area
      ORDER BY total DESC
    `;
    const zoneResult = await client.query(zoneSql, params);

    // Format response times as MM:SS
    const formatMinutes = (mins: number | null): string => {
      if (mins === null || isNaN(mins)) return '--:--';
      const totalSeconds = Math.round(mins * 60);
      const m = Math.floor(totalSeconds / 60);
      const s = totalSeconds % 60;
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    // Calculate transfusal rate: totalCalls / (transports + refusals)
    const totalCalls = parseInt(outcomes.total_calls) || 0;
    const transports = parseInt(outcomes.transports) || 0;
    const refusals = parseInt(outcomes.refusals) || 0;
    const denom = transports + refusals;
    const transfusalRate = denom > 0 ? Math.round((totalCalls / denom) * 100) / 100 : null;

    return NextResponse.json({
      ok: true,
      parish: { id: parish.id, name: parish.name, region: parish.region },
      dateRange: { start: startDate, end: endDate },
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
      timePerformance: {
        avgResponseMinutes: parseFloat(timeStats.avg_response_minutes) || null,
        avgResponseFormatted: formatMinutes(parseFloat(timeStats.avg_response_minutes)),
        medianResponseMinutes: parseFloat(timeStats.median_response_minutes) || null,
        medianResponseFormatted: formatMinutes(parseFloat(timeStats.median_response_minutes)),
        p90ResponseMinutes: parseFloat(timeStats.p90_response_minutes) || null,
        p90ResponseFormatted: formatMinutes(parseFloat(timeStats.p90_response_minutes)),
      },
      hospitals: hospitalResult.rows.map(r => ({ name: r.hospital, count: parseInt(r.count) })),
      exclusions: exclusionResult.rows.map(r => ({ reason: r.reason, count: parseInt(r.count) })),
      zones: zoneResult.rows.map(r => ({
        name: r.zone,
        total: parseInt(r.total),
        active: parseInt(r.active),
      })),
    });
  } catch (err: any) {
    console.error('Error fetching parish stats:', err);
    return NextResponse.json({ error: 'Failed to fetch stats', details: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

