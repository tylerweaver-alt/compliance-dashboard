import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdminSession } from '../_utils';
import { logAuditEvent } from '../_audit';

export async function GET() {
  try {
    await requireAdminSession();

    const { rows } = await query(
      `SELECT
         id,
         email,
         full_name,
         display_name,
         role,
         is_active,
         allowed_regions,
         has_all_regions,
         is_admin,
         created_at,
         updated_at
       FROM users
       ORDER BY email`
    );

    return NextResponse.json(rows);
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED' || err.message === 'FORBIDDEN') {
      return new NextResponse('Forbidden', { status: 403 });
    }
    console.error('Error fetching users', err);
    return new NextResponse('Server error', { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { user: actor } = await requireAdminSession();
    const body = await req.json();

    const email = (body.email as string | undefined)?.toLowerCase();
    const role = body.role as string | undefined;
    const fullName = (body.full_name as string | undefined) ?? null;
    const displayName = (body.display_name as string | undefined) ?? null;
    const allowedRegions = (body.allowed_regions as string[] | undefined) ?? [];
    const hasAllRegions = !!body.has_all_regions;
    const isActive = body.is_active !== false;
    const isAdmin = !!body.is_admin;

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }
    if (!role) {
      return NextResponse.json({ error: 'Role is required' }, { status: 400 });
    }

    const { rows } = await query(
      `INSERT INTO users (email, full_name, display_name, role, is_active,
                          allowed_regions, has_all_regions, is_admin)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (email)
       DO UPDATE SET
         full_name       = COALESCE(EXCLUDED.full_name, users.full_name),
         display_name    = COALESCE(EXCLUDED.display_name, users.display_name),
         role            = EXCLUDED.role,
         is_active       = EXCLUDED.is_active,
         allowed_regions = EXCLUDED.allowed_regions,
         has_all_regions = EXCLUDED.has_all_regions,
         is_admin        = EXCLUDED.is_admin,
         updated_at      = now()
       RETURNING *;`,
      [
        email,
        fullName,
        displayName,
        role,
        isActive,
        allowedRegions,
        hasAllRegions,
        isAdmin,
      ]
    );

    const newUser = rows[0];

    // Log to audit_logs
    await logAuditEvent({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: 'USER_UPSERT',
      targetType: 'user',
      targetId: newUser.id,
      summary: `Upserted user ${newUser.email} with role ${newUser.role}`,
      metadata: {
        role: newUser.role,
        is_active: newUser.is_active,
        has_all_regions: newUser.has_all_regions,
        is_admin: newUser.is_admin,
        allowed_regions: newUser.allowed_regions,
      },
    });

    return NextResponse.json(newUser, { status: 201 });
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED' || err.message === 'FORBIDDEN') {
      return new NextResponse('Forbidden', { status: 403 });
    }
    console.error('Error creating/updating user', err);
    return new NextResponse('Server error', { status: 500 });
  }
}

