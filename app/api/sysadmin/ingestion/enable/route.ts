/**
 * POST /api/sysadmin/ingestion/enable
 * Enable or disable SQL Server ingestion
 * Body: { enabled: boolean }
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadminSession, generateRunId, createRunLogger } from '../../_utils';
import { writeIngestionLog } from '@/lib/ingestion/pipeline';

export async function POST(req: Request) {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  const runId = generateRunId();
  const log = createRunLogger(runId, 'sqlserver', sessionCheck.user?.email);

  try {
    const body = await req.json();
    const enabled = Boolean(body.enabled);
    const action = enabled ? 'ENABLE' : 'DISABLE';

    await log.start(action, `Starting ingestion ${enabled ? 'enable' : 'disable'}`);

    // Update ingestion source
    await log.step(action, 'UPDATE_SOURCE', 'Updating ingestion source configuration');
    const { rows } = await query(`
      UPDATE ingestion_sources
      SET enabled = $1, updated_at = now()
      WHERE type = 'sqlserver'
      RETURNING id, enabled
    `, [enabled]);

    if (rows.length === 0) {
      await log.error(action, 'No sqlserver ingestion source found');
      return NextResponse.json({ error: 'No sqlserver ingestion source found', run_id: runId }, { status: 404 });
    }

    const source = rows[0];

    // Update worker status
    await log.step(action, 'UPDATE_WORKER', 'Updating worker status');
    const newState = enabled ? 'IDLE' : 'DISABLED';
    await query(`
      UPDATE ingestion_worker_status
      SET state = $1, last_heartbeat_at = now()
      WHERE source_id = $2
    `, [newState, source.id]);

    // Log to legacy ingestion logs as well
    await writeIngestionLog(source.id, 'INFO', enabled ? 'ENABLED' : 'DISABLED',
      `Ingestion ${enabled ? 'enabled' : 'disabled'} by ${sessionCheck.user.email}`,
      { actor: sessionCheck.user.email, enabled }
    );

    await log.success(action, `Ingestion ${enabled ? 'enabled' : 'disabled'} successfully`);

    return NextResponse.json({
      ok: true,
      enabled: source.enabled,
      message: `Ingestion ${enabled ? 'enabled' : 'disabled'}`,
      run_id: runId,
    });
  } catch (err: any) {
    console.error('[Sysadmin] Enable/disable ingestion failed:', err);
    await log.error('TOGGLE', `Enable/disable failed: ${err.message}`, undefined, { error_type: err.name });
    return NextResponse.json({ error: err.message, run_id: runId }, { status: 500 });
  }
}

