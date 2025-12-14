/**
 * POST /api/sysadmin/sql-ingest/connect
 * Enable SQL Server ingestion (flip enabled flag, set state to IDLE)
 * Does NOT start a worker process - worker runs independently
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
    await log.start('CONNECT', 'Enabling SQL Server ingestion');

    // Check if credentials are configured
    const { rows: secretRows } = await query<any>(`
      SELECT 
        sec.source_id,
        sec.host,
        sec.database,
        sec.username,
        sec.password_encrypted
      FROM ingestion_sources s
      JOIN ingestion_source_secrets sec ON sec.source_id = s.id
      WHERE s.type = 'sqlserver'
      LIMIT 1
    `);

    if (secretRows.length === 0) {
      await log.error('CONNECT', 'No sqlserver ingestion source found');
      return NextResponse.json({ error: 'No sqlserver ingestion source found', run_id: runId }, { status: 404 });
    }

    const secrets = secretRows[0];

    // Validate required fields
    if (!secrets.host || !secrets.database || !secrets.username || !secrets.password_encrypted) {
      await log.error('CONNECT', 'SQL Server credentials not fully configured');
      return NextResponse.json({
        error: 'SQL Server credentials not fully configured. Please save host, database, username, and password first.',
        run_id: runId
      }, { status: 400 });
    }

    // Enable the source
    await query(`
      UPDATE ingestion_sources
      SET enabled = true, updated_at = now()
      WHERE id = $1
    `, [secrets.source_id]);

    // Set worker state to IDLE (worker will pick up and start processing)
    await query(`
      UPDATE ingestion_worker_status
      SET state = 'IDLE', last_heartbeat_at = now()
      WHERE source_id = $1
    `, [secrets.source_id]);

    await writeIngestionLog(secrets.source_id, 'INFO', 'CONNECT',
      `Ingestion enabled by ${sessionCheck.user.email}`,
      { actor: sessionCheck.user.email }
    );

    await log.success('CONNECT', 'SQL Server ingestion enabled');

    return NextResponse.json({
      ok: true,
      message: 'SQL Server ingestion enabled. Worker will begin processing.',
      run_id: runId
    });
  } catch (err: any) {
    console.error('[Sysadmin] Connect failed:', err);
    await log.error('CONNECT', `Failed: ${err.message}`);
    return NextResponse.json({ error: err.message, run_id: runId }, { status: 500 });
  }
}

