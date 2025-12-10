// app/api/response-zones/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

// Next.js 14+ requires params to be awaited
type RouteContext = { params: Promise<{ id: string }> };

// GET /api/response-zones/[id] - Get a single zone
export async function GET(
  req: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  const zoneId = parseInt(id, 10);
  if (isNaN(zoneId)) {
    return NextResponse.json({ error: 'Invalid zone ID' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `SELECT id, parish_id, response_area as zone_name, threshold_minutes, locations
       FROM response_area_mappings WHERE id = $1`,
      [zoneId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Zone not found' }, { status: 404 });
    }

    const row = result.rows[0];
    return NextResponse.json({
      ok: true,
      zone: {
        id: row.id,
        parishId: row.parish_id,
        zoneName: row.zone_name,
        thresholdMinutes: row.threshold_minutes,
        locations: row.locations || [],
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to fetch zone', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// PUT /api/response-zones/[id] - Update a zone (all fields)
export async function PUT(
  req: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  const zoneId = parseInt(id, 10);
  if (isNaN(zoneId)) {
    return NextResponse.json({ error: 'Invalid zone ID' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { zoneName, thresholdMinutes, locations } = body;

  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE response_area_mappings
       SET response_area = COALESCE($1, response_area),
           threshold_minutes = $2,
           locations = COALESCE($3, locations)
       WHERE id = $4
       RETURNING id, parish_id, response_area as zone_name, threshold_minutes, locations`,
      [
        zoneName?.trim() || null,
        thresholdMinutes !== undefined ? (thresholdMinutes ? parseFloat(thresholdMinutes) : null) : null,
        Array.isArray(locations) ? locations : null,
        zoneId,
      ]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Zone not found' }, { status: 404 });
    }

    const row = result.rows[0];
    return NextResponse.json({
      ok: true,
      zone: {
        id: row.id,
        parishId: row.parish_id,
        zoneName: row.zone_name,
        thresholdMinutes: row.threshold_minutes,
        locations: row.locations || [],
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to update zone', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// PATCH /api/response-zones/[id] - Update zone boundary only
export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  const zoneId = parseInt(id, 10);
  if (isNaN(zoneId)) {
    return NextResponse.json({ error: 'Invalid zone ID' }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { boundary } = body;

  if (!boundary) {
    return NextResponse.json({ error: 'boundary is required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // First check if boundary column exists
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'response_area_mappings' AND column_name = 'boundary'
    `);

    if (colCheck.rowCount === 0) {
      // Add boundary column if it doesn't exist
      await client.query(`
        ALTER TABLE response_area_mappings
        ADD COLUMN IF NOT EXISTS boundary jsonb
      `);
    }

    const result = await client.query(
      `UPDATE response_area_mappings
       SET boundary = $1
       WHERE id = $2
       RETURNING id, parish_id, response_area as zone_name, threshold_minutes, locations, boundary`,
      [JSON.stringify(boundary), zoneId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Zone not found' }, { status: 404 });
    }

    const row = result.rows[0];
    return NextResponse.json({
      ok: true,
      zone: {
        id: row.id,
        parishId: row.parish_id,
        zoneName: row.zone_name,
        thresholdMinutes: row.threshold_minutes,
        locations: row.locations || [],
        boundary: row.boundary,
        hasPolygon: !!row.boundary,
      },
    });
  } catch (err: any) {
    console.error('PATCH /api/response-zones/[id] error:', err);
    return NextResponse.json(
      { error: 'Failed to update zone boundary', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// DELETE /api/response-zones/[id] - Delete a zone
export async function DELETE(
  req: NextRequest,
  context: RouteContext
) {
  const { id } = await context.params;
  const zoneId = parseInt(id, 10);
  if (isNaN(zoneId)) {
    return NextResponse.json({ error: 'Invalid zone ID' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `DELETE FROM response_area_mappings WHERE id = $1 RETURNING id`,
      [zoneId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: 'Zone not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, deletedId: zoneId });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to delete zone', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

