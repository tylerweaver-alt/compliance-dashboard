/**
 * POST /api/sysadmin/ingestion/test-connection
 * Test SQL Server CAD/Visinet connectivity
 */

import { NextResponse } from 'next/server';
import { requireSuperadminSession } from '../../_utils';
import { testSqlServerConnection } from '@/lib/ingestion/sqlserverAdapter';

export async function POST() {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  const start = Date.now();
  try {
    const result = await testSqlServerConnection();
    const latency_ms = Date.now() - start;
    
    return NextResponse.json({
      ok: result.ok,
      latency_ms,
      message: result.message,
      error: result.error || null,
    });
  } catch (err: any) {
    const latency_ms = Date.now() - start;
    console.error('[Sysadmin] SQL Server test connection failed:', err);
    return NextResponse.json({
      ok: false,
      latency_ms,
      error: err.message,
    });
  }
}

