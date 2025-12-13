/**
 * POST /api/sysadmin/ingestion/config
 * Update SQL Server ingestion configuration
 * Body: { batch_size?: number, poll_interval_ms?: number }
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadminSession } from '../../_utils';
import { writeIngestionLog } from '@/lib/ingestion/pipeline';

export async function POST(req: Request) {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  try {
    const body = await req.json();
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (typeof body.batch_size === 'number' && body.batch_size > 0 && body.batch_size <= 10000) {
      updates.push(`batch_size = $${paramIndex++}`);
      values.push(body.batch_size);
    }

    if (typeof body.poll_interval_ms === 'number' && body.poll_interval_ms >= 1000 && body.poll_interval_ms <= 300000) {
      updates.push(`poll_interval_ms = $${paramIndex++}`);
      values.push(body.poll_interval_ms);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid configuration fields provided' }, { status: 400 });
    }

    updates.push('updated_at = now()');

    const { rows } = await query(`
      UPDATE ingestion_sources
      SET ${updates.join(', ')}
      WHERE type = 'sqlserver'
      RETURNING id, batch_size, poll_interval_ms
    `, values);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No sqlserver ingestion source found' }, { status: 404 });
    }

    const source = rows[0];

    // Log the change
    await writeIngestionLog(source.id, 'INFO', 'CONFIG_UPDATE',
      `Configuration updated by ${sessionCheck.user.email}`,
      { actor: sessionCheck.user.email, batch_size: source.batch_size, poll_interval_ms: source.poll_interval_ms }
    );

    return NextResponse.json({
      ok: true,
      batch_size: source.batch_size,
      poll_interval_ms: source.poll_interval_ms,
    });
  } catch (err: any) {
    console.error('[Sysadmin] Config update failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

