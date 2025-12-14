/**
 * POST /api/sysadmin/ingestion/tick
 * Runs one batch "tick" of the SQL Server ingestion pipeline
 * Serverless-safe: no infinite loops, processes one batch and returns
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadminSession, generateRunId, createRunLogger } from '../../_utils';
import { runIngestionTick, IngestionSource } from '@/lib/ingestion/pipeline';

export async function POST() {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  const runId = generateRunId();
  const log = createRunLogger(runId, 'sqlserver', sessionCheck.user?.email);
  const action = 'TICK';

  await log.start(action, 'Starting ingestion tick');
  const start = Date.now();

  try {
    // Get the sqlserver source
    await log.step(action, 'GET_SOURCE', 'Fetching ingestion source configuration');
    const { rows: sourceRows } = await query(`
      SELECT id, type, enabled, watermark_ts, watermark_id, batch_size
      FROM ingestion_sources
      WHERE type = 'sqlserver'
      LIMIT 1
    `);

    if (sourceRows.length === 0) {
      await log.error(action, 'No sqlserver ingestion source configured');
      return NextResponse.json({
        ok: false,
        error: 'No sqlserver ingestion source configured',
        run_id: runId,
      }, { status: 404 });
    }

    const source = sourceRows[0] as IngestionSource;

    // Run the tick
    await log.step(action, 'RUN_TICK', 'Executing ingestion tick');
    const result = await runIngestionTick(source);
    const latency_ms = Date.now() - start;

    if (result.ok) {
      await log.success(action, `Tick completed: ${result.rows_processed || 0} rows processed`, latency_ms, {
        rows_processed: result.rows_processed,
        new_watermark: result.new_watermark,
      });
    } else {
      await log.error(action, result.error || 'Tick failed', latency_ms);
    }

    return NextResponse.json({ ...result, run_id: runId });
  } catch (err: any) {
    const latency_ms = Date.now() - start;
    console.error('[Sysadmin] Ingestion tick failed:', err);

    await log.error(action, `Tick failed: ${err.message}`, latency_ms, { error_type: err.name });
    return NextResponse.json({
      ok: false,
      error: err.message,
      run_id: runId,
    }, { status: 500 });
  }
}

