/**
 * GET /api/sysadmin/status
 * Combined status view for the Sysadmin Portal
 * Returns: Neon status, Vercel status, Auto-Exclusion placeholder, SQL ingestion status
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadminSession } from '../_utils';

export async function GET() {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  try {
    // 1. Neon DB status (simple SELECT 1 with timing)
    const neonStart = Date.now();
    let neonStatus = { ok: false, latency_ms: 0, error: null as string | null };
    try {
      await query('SELECT 1');
      neonStatus = { ok: true, latency_ms: Date.now() - neonStart, error: null };
    } catch (err: any) {
      neonStatus = { ok: false, latency_ms: Date.now() - neonStart, error: err.message };
    }

    // 2. Vercel/internal health (placeholder - just return ok)
    const vercelStatus = { ok: true, message: 'Internal API reachable' };

    // 3. Auto-Exclusion Engine (placeholder)
    const autoExclusionStatus = { status: 'NOT_IMPLEMENTED', message: 'Auto-exclusion engine not yet integrated' };

    // 4. SQL Server ingestion status
    let ingestionStatus = null;
    try {
      const { rows: sourceRows } = await query(`
        SELECT id, type, enabled, watermark_ts, watermark_id, batch_size, poll_interval_ms, updated_at
        FROM ingestion_sources
        WHERE type = 'sqlserver'
        LIMIT 1
      `);

      if (sourceRows.length > 0) {
        const source = sourceRows[0];
        const { rows: workerRows } = await query(`
          SELECT * FROM ingestion_worker_status WHERE source_id = $1
        `, [source.id]);

        const { rows: logRows } = await query(`
          SELECT id, level, event_type, message, metadata, created_at
          FROM ingestion_sqlserver_logs
          WHERE source_id = $1
          ORDER BY created_at DESC
          LIMIT 50
        `, [source.id]);

        ingestionStatus = {
          source,
          worker: workerRows[0] || null,
          recent_logs: logRows,
        };
      }
    } catch (err: any) {
      // Tables may not exist yet
      ingestionStatus = { error: err.message };
    }

    return NextResponse.json({
      neon: neonStatus,
      vercel: vercelStatus,
      autoExclusion: autoExclusionStatus,
      ingestion: ingestionStatus,
    });
  } catch (err: any) {
    console.error('[Sysadmin] Status check failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

