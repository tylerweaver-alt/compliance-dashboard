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
    const regionResult = await client.query(
      'SELECT id, name FROM regions WHERE id = $1',
      [regionId]
    );
    if (regionResult.rows.length === 0) {
      return NextResponse.json({ error: 'Region not found' }, { status: 404 });
    }
    const region = regionResult.rows[0];

    // Get parishes in this region
    const parishesResult = await client.query(
      `SELECT p.id, p.name FROM parishes p 
       JOIN regions r ON p.region = r.name 
       WHERE r.id = $1 AND p.is_contracted = true 
       ORDER BY p.name`,
      [regionId]
    );
    const parishIds = parishesResult.rows.map(p => p.id);
    
    if (parishIds.length === 0) {
      return NextResponse.json({
        ok: true,
        region: { id: region.id, name: region.name },
        dateRange: { start: startDate, end: endDate },
        outcomes: { totalCalls: 0, priorityCalls: 0, excludedCalls: 0, transports: 0, refusals: 0, cancelled: 0, noPatient: 0 },
        timePerformance: { avgResponseMinutes: null, avgResponseFormatted: '--:--', medianResponseMinutes: null, medianResponseFormatted: '--:--', p90ResponseMinutes: null, p90ResponseFormatted: '--:--' },
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

    // 1. Call Outcome Breakdown (region-wide)
    const outcomeSql = `
      SELECT
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE REPLACE(priority, '0', '') IN ('1', '2', '3') AND arrived_at_scene_time IS NOT NULL) as priority_calls,
        COUNT(*) FILTER (WHERE is_excluded = true) as excluded_calls,
        COUNT(*) FILTER (WHERE disposition ILIKE '%transport%' OR disposition ILIKE '%hosp%') as transports,
        COUNT(*) FILTER (WHERE disposition ILIKE '%refus%' OR disposition ILIKE '%rma%') as refusals,
        COUNT(*) FILTER (WHERE disposition ILIKE '%cancel%') as cancelled,
        COUNT(*) FILTER (WHERE disposition ILIKE '%no patient%' OR disposition ILIKE '%gone on arrival%') as no_patient
      FROM calls
      WHERE ${parishFilter} ${dateFilter}
    `;
    const outcomeResult = await client.query(outcomeSql, params);
    const outcomes = outcomeResult.rows[0];

    // 2. Time & Performance (region-wide)
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
      WHERE ${parishFilter} ${dateFilter}
        AND arrived_at_scene_time IS NOT NULL
        AND call_in_que_time IS NOT NULL
        AND REPLACE(priority, '0', '') IN ('1', '2', '3')
    `;
    const timeResult = await client.query(timeSql, params);
    const timeStats = timeResult.rows[0];

    // 3. Hospital Flow (top destinations region-wide)
    const hospitalSql = `
      SELECT
        COALESCE(destination_name, 'Unknown') as hospital,
        COUNT(*) as count
      FROM calls
      WHERE ${parishFilter} ${dateFilter}
        AND destination_name IS NOT NULL
        AND destination_name != ''
      GROUP BY destination_name
      ORDER BY count DESC
      LIMIT 10
    `;
    const hospitalResult = await client.query(hospitalSql, params);

    // 4. Exclusion Reasons (region-wide)
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
    const exclusionResult = await client.query(exclusionSql, params);

    // 5. Parish Breakdown
    const parishSql = `
      SELECT
        p.id,
        p.name,
        COUNT(*) as total_calls,
        COUNT(*) FILTER (WHERE REPLACE(c.priority, '0', '') IN ('1', '2', '3') AND c.arrived_at_scene_time IS NOT NULL) as priority_calls,
        COUNT(*) FILTER (WHERE c.is_excluded = true) as excluded_calls
      FROM calls c
      JOIN parishes p ON c.parish_id = p.id
      WHERE ${parishFilter} ${dateFilter}
      GROUP BY p.id, p.name
      ORDER BY total_calls DESC
    `;
    const parishBreakdownResult = await client.query(parishSql, params);

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
      region: { id: region.id, name: region.name },
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
      parishBreakdown: parishBreakdownResult.rows.map(r => ({
        id: r.id,
        name: r.name,
        totalCalls: parseInt(r.total_calls),
        priorityCalls: parseInt(r.priority_calls),
        excludedCalls: parseInt(r.excluded_calls),
      })),
    });
  } catch (err: any) {
    console.error('Error fetching region stats:', err);
    return NextResponse.json({ error: 'Failed to fetch stats', details: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

