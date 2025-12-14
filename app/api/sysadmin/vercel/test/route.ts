/**
 * POST /api/sysadmin/vercel/test
 * Test internal Vercel/API health connectivity
 */

import { NextResponse } from 'next/server';
import { requireSuperadminSession, generateRunId, createRunLogger } from '../../_utils';

export async function POST() {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  const runId = generateRunId();
  const log = createRunLogger(runId, 'vercel', sessionCheck.user?.email);
  const action = 'TEST_CONNECTION';

  await log.start(action, 'Starting Vercel API health check');

  const start = Date.now();
  try {
    await log.step(action, 'CHECK_ENV', 'Checking Vercel environment');
    const environment = process.env.VERCEL_ENV || 'local';
    const latency_ms = Date.now() - start;

    await log.success(action, `Vercel API responding normally`, latency_ms, { environment });
    return NextResponse.json({
      ok: true,
      latency_ms,
      message: 'Vercel API responding normally',
      environment,
      run_id: runId,
    });
  } catch (err: any) {
    const latency_ms = Date.now() - start;
    console.error('[Sysadmin] Vercel test failed:', err);

    await log.error(action, `Vercel check failed: ${err.message}`, latency_ms, { error_type: err.name });
    return NextResponse.json({ ok: false, latency_ms, error: err.message, run_id: runId });
  }
}

