/**
 * POST /api/sysadmin/neon/test
 * Test Neon DB connectivity with latency measurement
 */

import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireSuperadminSession } from '../../_utils';

export async function POST() {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  const start = Date.now();
  try {
    await query('SELECT 1');
    const latency_ms = Date.now() - start;
    return NextResponse.json({ ok: true, latency_ms });
  } catch (err: any) {
    const latency_ms = Date.now() - start;
    console.error('[Sysadmin] Neon test failed:', err);
    return NextResponse.json({ ok: false, latency_ms, error: err.message });
  }
}

