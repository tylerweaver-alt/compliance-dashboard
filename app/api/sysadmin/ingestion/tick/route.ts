/**
 * POST /api/sysadmin/ingestion/tick
 * Runs one batch "tick" of the SQL Server ingestion pipeline
 * Serverless-safe: no infinite loops, processes one batch and returns
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadminSession } from '../../_utils';
import { runIngestionTick, IngestionSource } from '@/lib/ingestion/pipeline';

export async function POST() {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  try {
    // Get the sqlserver source
    const { rows: sourceRows } = await query(`
      SELECT id, type, enabled, watermark_ts, watermark_id, batch_size
      FROM ingestion_sources
      WHERE type = 'sqlserver'
      LIMIT 1
    `);

    if (sourceRows.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'No sqlserver ingestion source configured',
      }, { status: 404 });
    }

    const source = sourceRows[0] as IngestionSource;

    // Run the tick
    const result = await runIngestionTick(source);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[Sysadmin] Ingestion tick failed:', err);
    return NextResponse.json({
      ok: false,
      error: err.message,
    }, { status: 500 });
  }
}

