/**
 * GET /api/calls/auto-exclusion-audit
 * 
 * Fetch auto-exclusion audit logs with filtering and pagination.
 * Shows all auto-exclusions applied by the engine.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parishId = searchParams.get('parish_id');
  const strategyKey = searchParams.get('strategy_key');
  const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 1000);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

  const client = await pool.connect();
  
  try {
    const whereClauses: string[] = ["el.exclusion_type = 'AUTO'"];
    const params: any[] = [];
    let paramIndex = 1;

    if (parishId) {
      whereClauses.push(`c.parish_id = $${paramIndex++}`);
      params.push(parseInt(parishId, 10));
    }

    if (strategyKey) {
      whereClauses.push(`el.strategy_key = $${paramIndex++}`);
      params.push(strategyKey);
    }

    params.push(limit);
    const limitParam = paramIndex++;
    params.push(offset);
    const offsetParam = paramIndex++;

    const sql = `
      SELECT 
        el.id,
        el.call_id,
        el.exclusion_type,
        el.strategy_key,
        el.reason,
        el.engine_metadata,
        el.created_at,
        c.response_number,
        c.parish_id,
        c.response_date_time,
        c.response_area
      FROM exclusion_logs el
      JOIN calls c ON c.id = el.call_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY el.created_at DESC
      LIMIT $${limitParam}
      OFFSET $${offsetParam}
    `;

    const result = await client.query(sql, params);

    // Get total count
    const countSql = `
      SELECT COUNT(*) as total
      FROM exclusion_logs el
      JOIN calls c ON c.id = el.call_id
      WHERE ${whereClauses.join(' AND ')}
    `;
    const countResult = await client.query(countSql, params.slice(0, -2));

    return NextResponse.json({
      ok: true,
      total: parseInt(countResult.rows[0].total, 10),
      limit,
      offset,
      rows: result.rows,
    });
  } catch (error: any) {
    console.error('Error fetching auto-exclusion audit:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs', details: error.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

