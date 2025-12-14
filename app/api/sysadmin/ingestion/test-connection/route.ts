/**
 * POST /api/sysadmin/ingestion/test-connection
 * Test SQL Server CAD/Visinet connectivity
 */

import { NextResponse } from 'next/server';
import { requireSuperadminSession, generateRunId, createRunLogger } from '../../_utils';
import { testSqlServerConnection } from '@/lib/ingestion/sqlserverAdapter';

export async function POST() {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  const runId = generateRunId();
  const log = createRunLogger(runId, 'sqlserver', sessionCheck.user?.email);
  const action = 'TEST_CONNECTION';

  await log.start(action, 'Starting SQL Server connection test');

  const start = Date.now();
  try {
    await log.step(action, 'CONNECT', 'Attempting SQL Server connection');
    const result = await testSqlServerConnection();
    const latency_ms = Date.now() - start;

    if (result.ok) {
      await log.success(action, result.message || 'SQL Server connection successful', latency_ms);
    } else {
      await log.error(action, result.error || 'SQL Server connection failed', latency_ms);
    }

    return NextResponse.json({
      ok: result.ok,
      latency_ms,
      message: result.message,
      error: result.error || null,
      run_id: runId,
    });
  } catch (err: any) {
    const latency_ms = Date.now() - start;
    console.error('[Sysadmin] SQL Server test connection failed:', err);

    await log.error(action, `SQL Server test failed: ${err.message}`, latency_ms, { error_type: err.name });
    return NextResponse.json({
      ok: false,
      latency_ms,
      error: err.message,
      run_id: runId,
    });
  }
}

