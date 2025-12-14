/**
 * POST /api/sysadmin/sql-ingest/disconnect
 * Disable SQL Server ingestion (flip enabled flag, set state to DISABLED)
 * Does NOT stop a worker process - worker checks enabled flag and stops itself
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadminSession, generateRunId, createRunLogger } from '../../_utils';
import { writeIngestionLog } from '@/lib/ingestion/pipeline';

export async function POST() {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  const runId = generateRunId();
  const log = createRunLogger(runId, 'sqlserver', sessionCheck.user?.email);

  try {
    await log.start('DISCONNECT', 'Disabling SQL Server ingestion');

    // Get source ID
    const { rows: sourceRows } = await query<any>(`
      SELECT id FROM ingestion_sources WHERE type = 'sqlserver' LIMIT 1
    `);

    if (sourceRows.length === 0) {
      await log.error('DISCONNECT', 'No sqlserver ingestion source found');
      return NextResponse.json({ error: 'No sqlserver ingestion source found', run_id: runId }, { status: 404 });
    }

    const sourceId = sourceRows[0].id;

    // Disable the source
    await query(`
      UPDATE ingestion_sources
      SET enabled = false, updated_at = now()
      WHERE id = $1
    `, [sourceId]);

    // Set worker state to DISABLED
    await query(`
      UPDATE ingestion_worker_status
      SET state = 'DISABLED', last_heartbeat_at = now()
      WHERE source_id = $1
    `, [sourceId]);

    await writeIngestionLog(sourceId, 'INFO', 'DISCONNECT',
      `Ingestion disabled by ${sessionCheck.user.email}`,
      { actor: sessionCheck.user.email }
    );

    await log.success('DISCONNECT', 'SQL Server ingestion disabled');

    return NextResponse.json({
      ok: true,
      message: 'SQL Server ingestion disabled. Worker will stop processing.',
      run_id: runId
    });
  } catch (err: any) {
    console.error('[Sysadmin] Disconnect failed:', err);
    await log.error('DISCONNECT', `Failed: ${err.message}`);
    return NextResponse.json({ error: err.message, run_id: runId }, { status: 500 });
  }
}

