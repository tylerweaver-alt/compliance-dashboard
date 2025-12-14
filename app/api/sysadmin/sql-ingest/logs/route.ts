/**
 * GET /api/sysadmin/sql-ingest/logs
 * Returns recent SQL Server ingestion logs
 * 
 * Query params:
 * - limit: number of logs to return (default 50, max 200)
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadminSession } from '../../_utils';

export async function GET(req: Request) {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  try {
    const url = new URL(req.url);
    const limitParam = url.searchParams.get('limit');
    let limit = 50;
    
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed) && parsed > 0 && parsed <= 200) {
        limit = parsed;
      }
    }

    // Get source ID
    const { rows: sourceRows } = await query<any>(`
      SELECT id FROM ingestion_sources WHERE type = 'sqlserver' LIMIT 1
    `);

    if (sourceRows.length === 0) {
      return NextResponse.json({ logs: [], message: 'No sqlserver ingestion source found' });
    }

    const sourceId = sourceRows[0].id;

    // Get logs
    const { rows: logs } = await query<any>(`
      SELECT 
        id,
        level,
        event_type,
        message,
        metadata,
        created_at
      FROM ingestion_sqlserver_logs
      WHERE source_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [sourceId, limit]);

    return NextResponse.json({ logs });
  } catch (err: any) {
    console.error('[Sysadmin] SQL ingest logs failed:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

