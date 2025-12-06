// app/api/admin/areas/[parishId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdminSession } from '../../_utils';
import { logAuditEvent } from '../../_audit';

export const runtime = 'nodejs';

interface Parish {
  id: number;
  name: string;
  region: string;
  place_type: string | null;
  is_contracted: boolean;
  logo_url: string | null;
}

// PATCH /api/admin/areas/[parishId] - Update an area
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ parishId: string }> }
) {
  const sessionCheck = await requireAdminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  const { parishId } = await params;
  const id = parseInt(parishId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid parish ID' }, { status: 400 });
  }

  try {
    // Check if parish exists
    const existing = await query<Parish>(
      'SELECT * FROM parishes WHERE id = $1',
      [id]
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    const body = await req.json();
    const { name, place_type, is_contracted, logo_url } = body;

    // Update the parish with provided fields
    const result = await query<Parish>(
      `UPDATE parishes
       SET name = COALESCE($2, name),
           place_type = COALESCE($3, place_type),
           is_contracted = COALESCE($4, is_contracted),
           logo_url = COALESCE($5, logo_url)
       WHERE id = $1
       RETURNING *`,
      [id, name, place_type, is_contracted, logo_url]
    );

    const updated = result.rows[0];

    // Log audit event
    await logAuditEvent({
      actorUserId: sessionCheck.user?.id,
      actorEmail: sessionCheck.user?.email || 'unknown',
      action: 'AREA_UPDATE',
      targetType: 'area',
      targetId: String(updated.id),
      summary: `Updated area ${updated.name}`,
      metadata: {
        region: updated.region,
        place_type: updated.place_type,
        is_contracted: updated.is_contracted,
        logo_url: updated.logo_url,
      },
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('PATCH /api/admin/areas/[parishId] error:', err);
    return NextResponse.json({ error: err.message || 'Failed to update area' }, { status: 500 });
  }
}

// DELETE /api/admin/areas/[parishId] - Delete an area
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ parishId: string }> }
) {
  const sessionCheck = await requireAdminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  const { parishId } = await params;
  const id = parseInt(parishId, 10);
  if (isNaN(id)) {
    return NextResponse.json({ error: 'Invalid parish ID' }, { status: 400 });
  }

  try {
    // Check if parish exists
    const existing = await query<Parish>(
      'SELECT * FROM parishes WHERE id = $1',
      [id]
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    const parish = existing.rows[0];

    // Delete parish_settings for this parish (using id as text since that's how it's stored)
    await query('DELETE FROM parish_settings WHERE parish_id = $1', [String(id)]);

    // Delete the parish itself
    await query('DELETE FROM parishes WHERE id = $1', [id]);

    // Log audit event
    await logAuditEvent({
      actorUserId: sessionCheck.user?.id,
      actorEmail: sessionCheck.user?.email || 'unknown',
      action: 'AREA_DELETE',
      targetType: 'area',
      targetId: String(parish.id),
      summary: `Deleted area ${parish.name} from region ${parish.region}`,
      metadata: { region: parish.region },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('DELETE /api/admin/areas/[parishId] error:', err);
    return NextResponse.json({ error: err.message || 'Failed to delete area' }, { status: 500 });
  }
}

