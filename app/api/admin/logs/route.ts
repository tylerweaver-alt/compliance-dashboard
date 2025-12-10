import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdminSession } from '../_utils';

export async function GET(req: Request) {
  try {
    await requireAdminSession();

    const { searchParams } = new URL(req.url);
    const limitParam = parseInt(searchParams.get('limit') ?? '50', 10);
    const offsetParam = parseInt(searchParams.get('offset') ?? '0', 10);

    // Clamp limit to max 200
    const limit = Math.min(Math.max(1, limitParam), 200);
    const offset = Math.max(0, offsetParam);

    const { rows } = await query(
      `SELECT
         id,
         created_at,
         actor_email,
         actor_role,
         category,
         action,
         target_email,
         target_id,
         details
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return NextResponse.json(rows);
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage === 'UNAUTHORIZED' || errorMessage === 'FORBIDDEN') {
      return new NextResponse('Forbidden', { status: 403 });
    }
    console.error('Error fetching audit logs', err);
    return new NextResponse('Server error', { status: 500 });
  }
}

