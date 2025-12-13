/**
 * GET /api/sysadmin/ingestion/status
 * Returns detailed SQL Server ingestion status, worker status, and recent logs
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadminSession } from '../../_utils';

export async function GET() {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  try {
    // Get ingestion source config
    const { rows: sourceRows } = await query(`
      SELECT id, type, enabled, watermark_ts, watermark_id, batch_size, poll_interval_ms, created_at, updated_at
      FROM ingestion_sources
      WHERE type = 'sqlserver'
      LIMIT 1
    `);

    if (sourceRows.length === 0) {
      return NextResponse.json({
        source: null,
        worker: null,
        recent_logs: [],
        message: 'No sqlserver ingestion source configured',
      });
    }

    const source = sourceRows[0];

    // Get worker status
    const { rows: workerRows } = await query(`
      SELECT 
        state,
        last_heartbeat_at,
        last_success_at,
        last_error_at,
        last_error_message,
        last_ingested_call_id,
        last_ingested_ts,
        rows_ingested_total,
        rows_ingested_last_60s,
        avg_rows_per_sec_60s,
        current_lag_seconds,
        uptime_seconds,
        downtime_seconds
      FROM ingestion_worker_status
      WHERE source_id = $1
    `, [source.id]);

    // Get recent logs (last 50)
    const { rows: logRows } = await query(`
      SELECT id, level, event_type, message, metadata, created_at
      FROM ingestion_sqlserver_logs
      WHERE source_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [source.id]);

    return NextResponse.json({
      source,
      worker: workerRows[0] || null,
      recent_logs: logRows,
    });
  } catch (err: any) {
    console.error('[Sysadmin] Ingestion status failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

