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
         timestamp,
         actor_user_id,
         actor_email,
         action,
         target_type,
         target_id,
         summary,
         metadata
       FROM audit_logs
       ORDER BY timestamp DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return NextResponse.json(rows);
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED' || err.message === 'FORBIDDEN') {
      return new NextResponse('Forbidden', { status: 403 });
    }

    // Check if table doesn't exist
    if (err.code === '42P01') {
      console.error('audit_logs table does not exist. Please run the migration in db/migrations/audit_logs.sql');
      return NextResponse.json({
        error: 'Audit logs table not found. Please contact administrator to run database migration.',
        rows: []
      }, { status: 200 });
    }

    console.error('Error fetching audit logs:', err);
    return new NextResponse(`Server error: ${err.message}`, { status: 500 });
  }
}

