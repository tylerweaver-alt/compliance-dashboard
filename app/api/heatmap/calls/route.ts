// app/api/heatmap/calls/route.ts
// Returns lat/lng points for call density heatmap layer

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export const runtime = "nodejs";

// Map region codes to DB region names
const REGION_CODE_TO_DB_REGION: Record<string, string> = {
  CENLA: "Central Louisiana",
  SWLA: "Southwest Louisiana",
  NOLA: "New Orleans",
  NELA: "Northeast Louisiana",
  SELA: "Southeast Louisiana",
};

/**
 * GET /api/heatmap/calls?region=CENLA&parishId=6&start=2025-01-01&end=2025-12-31
 * 
 * Returns array of { lat, lng, weight } for heatmap rendering
 * - region: required, e.g. "CENLA"
 * - parishId: optional, filter to specific parish
 * - start/end: optional date range (YYYY-MM-DD)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const regionParam = searchParams.get("region") || "CENLA";
    const parishIdParam = searchParams.get("parishId");
    const startParam = searchParams.get("start");
    const endParam = searchParams.get("end");

    const regionCode = regionParam.toUpperCase();
    const dbRegion = REGION_CODE_TO_DB_REGION[regionCode] ?? regionParam;

    // Build query dynamically
    const whereClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Filter by region via parish join
    whereClauses.push(`p.region = $${paramIndex++}`);
    params.push(dbRegion);

    // Optional parish filter
    if (parishIdParam) {
      const parishId = parseInt(parishIdParam, 10);
      if (!isNaN(parishId)) {
        whereClauses.push(`c.parish_id = $${paramIndex++}`);
        params.push(parishId);
      }
    }

    // Optional date range filter
    if (startParam) {
      whereClauses.push(`to_date(c.response_date, 'MM/DD/YYYY') >= $${paramIndex++}::date`);
      params.push(startParam);
    }
    if (endParam) {
      whereClauses.push(`to_date(c.response_date, 'MM/DD/YYYY') <= $${paramIndex++}::date`);
      params.push(endParam);
    }

    // Require valid coordinates
    whereClauses.push(`c.origin_latitude IS NOT NULL`);
    whereClauses.push(`c.origin_longitude IS NOT NULL`);
    whereClauses.push(`c.origin_latitude::numeric != 0`);
    whereClauses.push(`c.origin_longitude::numeric != 0`);

    const whereClause = whereClauses.join(" AND ");

    // Query calls with lat/lng
    const result = await query<{
      lat: string;
      lng: string;
    }>(
      `
      SELECT 
        c.origin_latitude::numeric AS lat,
        c.origin_longitude::numeric AS lng
      FROM calls c
      JOIN parishes p ON c.parish_id = p.id
      WHERE ${whereClause}
      LIMIT 10000
      `,
      params
    );

    // Convert to heatmap points with weight
    const points = result.rows.map((row) => ({
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      weight: 1, // Could be weighted by response time, priority, etc.
    }));

    return NextResponse.json({
      region: regionCode,
      parishId: parishIdParam ? parseInt(parishIdParam, 10) : null,
      start: startParam,
      end: endParam,
      count: points.length,
      points,
    });
  } catch (err: any) {
    console.error("Error in /api/heatmap/calls:", err);
    return NextResponse.json(
      {
        error: "Failed to fetch heatmap call data",
        details: err?.message,
      },
      { status: 500 }
    );
  }
}

