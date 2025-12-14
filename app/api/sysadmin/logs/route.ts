/**
 * GET /api/sysadmin/logs
 * Fetch sysadmin service logs with optional filtering
 * Query params:
 *   - service: all | neon | vercel | sqlserver | autoexclusion
 *   - limit: number (default 100, max 500)
 *   - run_id: optional UUID to filter by specific run
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadminSession } from '../_utils';

export async function GET(request: NextRequest) {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const service = searchParams.get('service') || 'all';
    const limitParam = parseInt(searchParams.get('limit') || '100', 10);
    const limit = Math.min(Math.max(1, limitParam), 500);
    const runId = searchParams.get('run_id');

    let sql = `
      SELECT id, run_id, service, action, step, level, message, latency_ms, actor_email, metadata, created_at
      FROM sysadmin_service_logs
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (service && service !== 'all') {
      params.push(service);
      conditions.push(`service = $${params.length}`);
    }

    if (runId) {
      params.push(runId);
      conditions.push(`run_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY created_at DESC';
    params.push(limit);
    sql += ` LIMIT $${params.length}`;

    const { rows } = await query(sql, params);

    return NextResponse.json({
      logs: rows,
      count: rows.length,
      filters: { service, limit, run_id: runId },
    });
  } catch (err: any) {
    console.error('[Sysadmin] Failed to fetch logs:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

