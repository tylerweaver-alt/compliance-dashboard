// Summary API for parish compliance stats; requires authenticated session.
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const parishNameRaw = searchParams.get('parish');

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
      return NextResponse.json(
        { error: `Unknown parish: ${parishName}` },
        { status: 400 }
      );
    }

    const parishId = parishRows[0].id;

    // NOTE:
    //  - Join zones to calls on parish_id + zone_name
    //  - Exclude rows where is_excluded = true
    //  - Treat is_late = true as non-compliant
    const { rows } = await query<{
      zone: string;
      threshold_minutes: number;
      compliance_target: string;
      total_calls: string;
      compliant_calls: string;
    }>(
      `
      SELECT
        z.name AS zone,
        z.threshold_minutes,
        z.compliance_target,
        COUNT(*) FILTER (
          WHERE c.id IS NOT NULL
            AND NOT COALESCE(c.is_excluded, false)
        ) AS total_calls,
        COUNT(*) FILTER (
          WHERE c.id IS NOT NULL
            AND NOT COALESCE(c.is_excluded, false)
            AND NOT COALESCE(c.is_late, false)
        ) AS compliant_calls
      FROM zones z
      LEFT JOIN calls c
        ON c.parish_id = z.parish_id
       AND LOWER(c.zone_name) = LOWER(z.name)
      WHERE z.parish_id = $1
      GROUP BY z.id
      ORDER BY z.name;
      `,
      [parishId]
    );

    const zones = rows.map((r) => {
      const total = Number(r.total_calls || 0);
      const compliant = Number(r.compliant_calls || 0);
      const rate = total > 0 ? (compliant / total) * 100 : 0;

      return {
        zone: r.zone,
        threshold: r.threshold_minutes,
        complianceTarget: Number(r.compliance_target),
        totalCalls: total,
        compliantCalls: compliant,
        complianceRate: Number(rate.toFixed(1)),
      };
    });

    const totalCalls = zones.reduce((sum, z) => sum + z.totalCalls, 0);
    const totalCompliant = zones.reduce((sum, z) => sum + z.compliantCalls, 0);
    const overallRate =
      totalCalls > 0 ? Number(((totalCompliant / totalCalls) * 100).toFixed(1)) : 0;

    return NextResponse.json({
      parish: parishName,
      totalCalls,
      totalCompliant,
      overallRate,
      zones,
    });
  } catch (err: any) {
    console.error('parish-summary error', err);
    return NextResponse.json(
      {
        error: 'Server error getting parish summary',
        details: err.message || String(err),
      },
      { status: 500 }
    );
  }
}
