/**
 * Sysadmin Logs API
 * 
 * GET /api/sysadmin/logs
 * Returns queryable sysadmin_log entries.
 * 
 * Query parameters:
 * - category: Filter by category (optional)
 * - componentId: Filter by component (optional)
 * - level: Filter by level (optional)
 * - from: ISO timestamp for start date (optional)
 * - to: ISO timestamp for end date (optional)
 * - limit: Max rows to return (default 100, max 500)
 * 
 * Protected by middleware: requires SuperAdmin + IP allowlist.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface SysadminLogRow {
  id: number;
  created_at: string;
  category: string;
  component_id: string | null;
  status: string | null;
  status_text: string | null;
  level: string;
  message: string;
  actor_email: string | null;
  source: string | null;
  details: Record<string, unknown> | null;
}

interface LogResponse {
  id: number;
  createdAt: string;
  category: string;
  componentId: string | null;
  status: string | null;
  statusText: string | null;
  level: string;
  message: string;
  actorEmail: string | null;
  source: string | null;
  details: Record<string, unknown> | null;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    // Parse query parameters
    const category = searchParams.get('category');
    const componentId = searchParams.get('componentId');
    const level = searchParams.get('level');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const limitParam = searchParams.get('limit');
    
    // Validate and cap limit
    let limit = 100;
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 500);
      }
    }

    // Build query dynamically
    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (category && category !== 'ALL') {
      conditions.push(`category = $${paramIndex++}`);
      params.push(category);
    }

    if (componentId && componentId !== 'ALL') {
      conditions.push(`component_id = $${paramIndex++}`);
      params.push(componentId);
    }

    if (level && level !== 'ALL') {
      conditions.push(`level = $${paramIndex++}`);
      params.push(level);
    }

    if (from) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(from);
    }

    if (to) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    params.push(limit);
    const limitClause = `LIMIT $${paramIndex}`;

    const sql = `
      SELECT id, created_at, category, component_id, status, status_text, 
             level, message, actor_email, source, details
      FROM sysadmin_log
      ${whereClause}
      ORDER BY created_at DESC
      ${limitClause}
    `;

    const result = await query<SysadminLogRow>(sql, params);

    // Map to response format
    const logs: LogResponse[] = result.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      category: row.category,
      componentId: row.component_id,
      status: row.status,
      statusText: row.status_text,
      level: row.level,
      message: row.message,
      actorEmail: row.actor_email,
      source: row.source,
      details: row.details,
    }));

    return NextResponse.json({ logs });
  } catch (error) {
    console.error('[Sysadmin Logs API] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch logs', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

