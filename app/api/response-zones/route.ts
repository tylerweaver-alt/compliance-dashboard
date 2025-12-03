// app/api/response-zones/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// GET /api/response-zones?parish_id=7 - Get all zones for a parish
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parishId = searchParams.get('parish_id');

  const client = await pool.connect();
  try {
    // Check if boundary column exists, if not use null
    let hasBoundaryColumn = false;
    try {
      const colCheck = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'response_area_mappings' AND column_name = 'boundary'
      `);
      hasBoundaryColumn = colCheck.rowCount !== null && colCheck.rowCount > 0;
    } catch {
      hasBoundaryColumn = false;
    }

    let sql = `
      SELECT
        id,
        parish_id,
        response_area as zone_name,
        threshold_minutes,
        locations${hasBoundaryColumn ? ', boundary' : ''}
      FROM response_area_mappings
    `;
    const params: any[] = [];

    if (parishId) {
      sql += ` WHERE parish_id = $1`;
      params.push(parseInt(parishId, 10));
    }

    sql += ` ORDER BY parish_id, response_area`;

    const result = await client.query(sql, params);

    // Get all unique cities from calls that aren't assigned to any zone (parish-wide contributions)
    let unassignedLocations: string[] = [];
    if (parishId) {
      // Get all assigned locations (flattened from all zones)
      const allAssignedLocations: string[] = [];
      result.rows.forEach(row => {
        if (row.locations && Array.isArray(row.locations)) {
          allAssignedLocations.push(...row.locations.map((l: string) => l.toLowerCase()));
        }
      });

      // Get zone names (response_area values that are zones themselves)
      const zoneNames = result.rows.map(row => row.zone_name?.toLowerCase()).filter(Boolean);

      // Get all unique origin cities from calls for this parish
      const citiesResult = await client.query(`
        SELECT DISTINCT origin_location_city
        FROM calls
        WHERE parish_id = $1
          AND origin_location_city IS NOT NULL
          AND origin_location_city != ''
        ORDER BY origin_location_city
      `, [parseInt(parishId, 10)]);

      // Filter out cities that are assigned to a zone
      unassignedLocations = citiesResult.rows
        .map(row => row.origin_location_city)
        .filter(city => {
          const cityLower = city.toLowerCase();
          // City is unassigned if:
          // 1. It's not in any zone's locations list
          // 2. It's not a zone name itself (exact match)
          // 3. No zone name contains this city name (partial match - e.g., "Ville Platte 8min" contains "Ville Platte")
          const isInLocations = allAssignedLocations.includes(cityLower);
          const isZoneName = zoneNames.includes(cityLower);
          const isPartOfZoneName = zoneNames.some(zoneName => zoneName.includes(cityLower));

          return !isInLocations && !isZoneName && !isPartOfZoneName;
        });
    }

    return NextResponse.json({
      ok: true,
      zones: result.rows.map(row => ({
        id: row.id,
        parishId: row.parish_id,
        zoneName: row.zone_name,
        thresholdMinutes: row.threshold_minutes ? parseFloat(row.threshold_minutes) : null,
        locations: row.locations || [],
        boundary: row.boundary || null,
        hasPolygon: !!row.boundary,
      })),
      unassignedLocations,
    });
  } catch (err: any) {
    console.error('GET /api/response-zones error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch response zones', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// POST /api/response-zones - Create a new zone
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { parishId, zoneName, thresholdMinutes, locations } = body;

  if (!parishId || !zoneName) {
    return NextResponse.json(
      { error: 'parishId and zoneName are required' },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      INSERT INTO response_area_mappings (parish_id, response_area, threshold_minutes, locations)
      VALUES ($1, $2, $3, $4)
      RETURNING id, parish_id, response_area as zone_name, threshold_minutes, locations
      `,
      [
        parseInt(parishId, 10),
        zoneName.trim(),
        thresholdMinutes ? parseFloat(thresholdMinutes) : null,
        Array.isArray(locations) ? locations : [],
      ]
    );

    return NextResponse.json({
      ok: true,
      zone: {
        id: result.rows[0].id,
        parishId: result.rows[0].parish_id,
        zoneName: result.rows[0].zone_name,
        thresholdMinutes: result.rows[0].threshold_minutes,
        locations: result.rows[0].locations || [],
      },
    });
  } catch (err: any) {
    console.error('POST /api/response-zones error:', err);
    return NextResponse.json(
      { error: 'Failed to create response zone', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

