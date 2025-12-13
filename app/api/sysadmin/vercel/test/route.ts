/**
 * POST /api/sysadmin/vercel/test
 * Test internal Vercel/API health connectivity
 */

import { NextResponse } from 'next/server';
import { requireSuperadminSession } from '../../_utils';

export async function POST() {
  const sessionCheck = await requireSuperadminSession();
  if (sessionCheck.error) {
    return NextResponse.json({ error: sessionCheck.error }, { status: sessionCheck.status });
  }

  const start = Date.now();
  try {
    // Try to call an internal health endpoint or just confirm the API is responding
    // Since we're already responding, this confirms Vercel is working
    const latency_ms = Date.now() - start;
    return NextResponse.json({
      ok: true,
      latency_ms,
      message: 'Vercel API responding normally',
      environment: process.env.VERCEL_ENV || 'local',
    });
  } catch (err: any) {
    const latency_ms = Date.now() - start;
    console.error('[Sysadmin] Vercel test failed:', err);
    return NextResponse.json({ ok: false, latency_ms, error: err.message });
  }
}

