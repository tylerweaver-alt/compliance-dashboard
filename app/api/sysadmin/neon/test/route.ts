/**
 * POST /api/sysadmin/neon/test
 * Test Neon DB connectivity with latency measurement
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadminSession, generateRunId, createRunLogger } from '../../_utils';

export async function POST() {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  const runId = generateRunId();
  const log = createRunLogger(runId, 'neon', sessionCheck.user?.email);
  const action = 'TEST_CONNECTION';

  await log.start(action, 'Starting Neon database connection test');

  const start = Date.now();
  try {
    await log.step(action, 'CONNECT', 'Connecting to Neon database');
    await query('SELECT 1');
    const latency_ms = Date.now() - start;

    await log.success(action, `Neon connection successful`, latency_ms, { latency_ms });
    return NextResponse.json({ ok: true, latency_ms, run_id: runId });
  } catch (err: any) {
    const latency_ms = Date.now() - start;
    console.error('[Sysadmin] Neon test failed:', err);

    await log.error(action, `Neon connection failed: ${err.message}`, latency_ms, { error_type: err.name });
    return NextResponse.json({ ok: false, latency_ms, error: err.message, run_id: runId });
  }
}

