// app/api/admin/regions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdminSession } from '../_utils';
import { logAuditEvent } from '../_audit';

export const runtime = 'nodejs';

interface Region {
  id: number;
  name: string;
  display_order: number | null;
  areas: Area[];
}

interface Area {
  id: number;
  name: string;
  place_type: string | null;
  logo_url: string | null;
  is_contracted: boolean;
  use_zones: boolean | null;
}

// GET /api/admin/regions - List all regions with their areas
export async function GET(req: NextRequest) {
  const sessionCheck = await requireAdminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  try {
    // Get all regions
    const regionsResult = await query<{ id: number; name: string; display_order: number | null }>(
      `SELECT id, name, display_order
       FROM regions
       ORDER BY display_order, name`
    );

    const regions: Region[] = [];

    // For each region, get its areas (parishes) with their settings
    // Note: parish_settings.parish_id stores the parish ID as text
    for (const region of regionsResult.rows) {
      const areasResult = await query<Area>(
        `SELECT p.id, p.name, p.place_type, p.logo_url, p.is_contracted,
                ps.use_zones
         FROM parishes p
         LEFT JOIN parish_settings ps ON ps.parish_id = p.id::text
         WHERE p.region = $1
         ORDER BY p.name`,
        [region.name]
      );

      regions.push({
        id: region.id,
        name: region.name,
        display_order: region.display_order,
        areas: areasResult.rows,
      });
    }

    return NextResponse.json(regions);
  } catch (err: any) {
    console.error('GET /api/admin/regions error:', err);
    return NextResponse.json(
      { error: 'Failed to load regions', details: err.message },
      { status: 500 }
    );
  }
}

// POST /api/admin/regions - Create a new region
export async function POST(req: NextRequest) {
  const sessionCheck = await requireAdminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  try {
    const body = await req.json();
    const { name, display_order } = body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ error: 'Region name is required' }, { status: 400 });
    }

    const trimmedName = name.trim();

    // Check if region already exists
    const existingResult = await query<{ id: number; name: string }>(
      `SELECT id, name FROM regions WHERE LOWER(name) = LOWER($1)`,
      [trimmedName]
    );

    if (existingResult.rows.length > 0) {
      // Update display_order if provided
      if (display_order !== undefined) {
        await query(
          `UPDATE regions SET display_order = $1 WHERE name = $2`,
          [display_order, existingResult.rows[0].name]
        );
      }
      return NextResponse.json(
        { error: 'Region already exists', existing: existingResult.rows[0] },
        { status: 409 }
      );
    }

    // Insert new region
    const insertResult = await query<{ id: number; name: string; display_order: number | null }>(
      `INSERT INTO regions (name, display_order)
       VALUES ($1, $2)
       RETURNING id, name, display_order`,
      [trimmedName, display_order ?? null]
    );

    const newRegion = insertResult.rows[0];

    // Log audit event
    await logAuditEvent({
      actorUserId: sessionCheck.user?.id,
      actorEmail: sessionCheck.user?.email,
      action: 'REGION_CREATE',
      targetType: 'region',
      targetId: String(newRegion.id),
      summary: `Created region "${newRegion.name}"`,
      metadata: { display_order: newRegion.display_order },
    });

    return NextResponse.json(newRegion, { status: 201 });
  } catch (err: any) {
    console.error('POST /api/admin/regions error:', err);
    return NextResponse.json(
      { error: 'Failed to create region', details: err.message },
      { status: 500 }
    );
  }
}

// DELETE /api/admin/regions?regionId=123 - Delete a region (only if empty)
export async function DELETE(req: NextRequest) {
  const sessionCheck = await requireAdminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  try {
    const { searchParams } = new URL(req.url);
    const regionId = searchParams.get('regionId');

    if (!regionId) {
      return NextResponse.json({ error: 'regionId is required' }, { status: 400 });
    }

    const id = parseInt(regionId, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid regionId' }, { status: 400 });
    }

    // Load region by id
    const regionResult = await query<{ id: number; name: string }>(
      'SELECT id, name FROM regions WHERE id = $1',
      [id]
    );

    if (regionResult.rows.length === 0) {
      return NextResponse.json({ error: 'Region not found' }, { status: 404 });
    }

    const region = regionResult.rows[0];

    // Check if there are any parishes assigned to this region
    const countResult = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM parishes WHERE region = $1',
      [region.name]
    );

    const areaCount = parseInt(countResult.rows[0].count, 10);

    if (areaCount > 0) {
      return NextResponse.json(
        { error: 'Cannot delete region while it still has areas. Remove or reassign areas first.' },
        { status: 400 }
      );
    }

    // Delete the region
    await query('DELETE FROM regions WHERE id = $1', [id]);

    // Log audit event
    await logAuditEvent({
      actorUserId: sessionCheck.user?.id,
      actorEmail: sessionCheck.user?.email || 'unknown',
      action: 'REGION_DELETE',
      targetType: 'region',
      targetId: String(region.id),
      summary: `Deleted region ${region.name}`,
      metadata: {},
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/admin/regions error:', err);
    return NextResponse.json(
      { error: 'Failed to delete region', details: err.message },
      { status: 500 }
    );
  }
}

