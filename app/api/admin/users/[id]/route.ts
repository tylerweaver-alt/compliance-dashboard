import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdminSession } from '../../_utils';
import { logAuditEvent } from '../../_audit';

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const sessionCheck = await requireAdminSession();
    if (sessionCheck.error) {
      return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
    }
    const actor = sessionCheck.user;
    const body = await req.json();
    const { id } = await params;

    const { rows: existingRows } = await query(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    if (existingRows.length === 0) {
      return new NextResponse('User not found', { status: 404 });
    }

    const role = body.role as string | undefined;
    const isActive = body.is_active as boolean | undefined;
    const allowedRegions = body.allowed_regions as string[] | undefined;
    const hasAllRegions = body.has_all_regions as boolean | undefined;
    const isAdmin = body.is_admin as boolean | undefined;

    const { rows } = await query(
      `UPDATE users
       SET
         role            = COALESCE($2, role),
         is_active       = COALESCE($3, is_active),
         allowed_regions = COALESCE($4, allowed_regions),
         has_all_regions = COALESCE($5, has_all_regions),
         is_admin        = COALESCE($6, is_admin),
         updated_at      = now()
       WHERE id = $1
       RETURNING *;`,
      [
        id,
        role ?? null,
        typeof isActive === 'boolean' ? isActive : null,
        allowedRegions ?? null,
        typeof hasAllRegions === 'boolean' ? hasAllRegions : null,
        typeof isAdmin === 'boolean' ? isAdmin : null,
      ]
    );

    const updated = rows[0];

    // Log to audit_logs
    await logAuditEvent({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: 'USER_UPDATE',
      targetType: 'user',
      targetId: updated.id,
      summary: `Updated user ${updated.email}`,
      metadata: {
        role: updated.role,
        is_active: updated.is_active,
        has_all_regions: updated.has_all_regions,
        is_admin: updated.is_admin,
        allowed_regions: updated.allowed_regions,
      },
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('Error updating user', err);
    return new NextResponse('Server error', { status: 500 });
  }
}

