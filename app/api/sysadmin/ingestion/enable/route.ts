/**
 * POST /api/sysadmin/ingestion/enable
 * Enable or disable SQL Server ingestion
 * Body: { enabled: boolean }
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
    const enabled = Boolean(body.enabled);

    // Update ingestion source
    const { rows } = await query(`
      UPDATE ingestion_sources
      SET enabled = $1, updated_at = now()
      WHERE type = 'sqlserver'
      RETURNING id, enabled
    `, [enabled]);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No sqlserver ingestion source found' }, { status: 404 });
    }

    const source = rows[0];

    // Update worker status
    const newState = enabled ? 'IDLE' : 'DISABLED';
    await query(`
      UPDATE ingestion_worker_status
      SET state = $1, last_heartbeat_at = now()
      WHERE source_id = $2
    `, [newState, source.id]);

    // Log the change
    await writeIngestionLog(source.id, 'INFO', enabled ? 'ENABLED' : 'DISABLED', 
      `Ingestion ${enabled ? 'enabled' : 'disabled'} by ${sessionCheck.user.email}`,
      { actor: sessionCheck.user.email, enabled }
    );

    return NextResponse.json({
      ok: true,
      enabled: source.enabled,
      message: `Ingestion ${enabled ? 'enabled' : 'disabled'}`,
    });
  } catch (err: any) {
    console.error('[Sysadmin] Enable/disable ingestion failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

