import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/deployment/coverage?region=CENLA&minutes=8
 *
 * - For each deployment site in a region:
 *   - Joins its isochrone polygon (for given minutes)
 *   - Counts calls whose geom is inside that polygon
 * - Also returns total calls in the table (with geom)
 *
 * NOTE:
 *   Date filtering is disabled until we know the correct date column.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const region = searchParams.get("region") ?? "CENLA";
    const minutesStr = searchParams.get("minutes") ?? "8";

    const minutes = parseInt(minutesStr, 10);
    if (Number.isNaN(minutes) || minutes <= 0) {
      return NextResponse.json(
        { error: "Invalid minutes parameter" },
        { status: 400 }
      );
    }

    // 1) Total calls with geom — NO DATE FILTER YET
    const totalCallsRes = await query<{ count: string }>(
      `
      SELECT COUNT(*)::text AS count
      FROM calls
      WHERE geom IS NOT NULL;
      `
    );

    const totalCalls = parseInt(totalCallsRes.rows[0]?.count ?? "0", 10);

    // 2) Calls inside each site's isochrone (multi-year)
    const coverageRes = await query<{
      site_id: number;
      site_name: string;
      calls_inside: string;
    }>(
      `
      SELECT
        s.id AS site_id,
        s.name AS site_name,
        COUNT(c.*)::text AS calls_inside
      FROM deployment_sites s
      JOIN deployment_isochrones i
        ON i.site_id = s.id
       AND i.minutes = $1
      LEFT JOIN calls c
        ON c.geom IS NOT NULL
       AND ST_Contains(i.geom, c.geom)
      WHERE s.is_active = TRUE
        AND s.region = $2
      GROUP BY s.id, s.name
      ORDER BY COUNT(c.*) DESC;
      `,
      [minutes, region]
    );

    const sites = coverageRes.rows.map((row) => {
      const callsInside = parseInt(row.calls_inside ?? "0", 10);
      const coveragePercentOfAllCalls =
        totalCalls > 0 ? callsInside / totalCalls : 0;

      return {
        siteId: row.site_id,
        name: row.site_name,
        callsInside,
        coveragePercentOfAllCalls,
      };
    });

    return NextResponse.json(
      {
        region,
        minutes,
        totalCalls,
        sites,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Error in /api/deployment/coverage:", err);
    return NextResponse.json(
      {
        error: "Server error computing coverage",
        details: err?.message,
      },
      { status: 500 }
    );
  }
}
