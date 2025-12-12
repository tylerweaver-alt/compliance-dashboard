/**
 * POST /api/calls/exclusion
 * 
 * Manually exclude or un-exclude a call from compliance calculations.
 * Creates full audit trail in exclusion_logs and audit_logs tables.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { recordManualExclusion, revertManualExclusion } from '@/lib/exclusions';

export const runtime = 'nodejs';

interface ExclusionRequest {
  callId: number;
  reason: string;
  action: 'exclude' | 'unexclude';
}

export async function POST(req: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: ExclusionRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { callId, reason, action } = body;

  // Validate
  if (!callId || !reason || !action) {
    return NextResponse.json(
      { error: 'Missing required fields: callId, reason, action' },
      { status: 400 }
    );
  }

  if (action !== 'exclude' && action !== 'unexclude') {
    return NextResponse.json(
      { error: 'Invalid action. Must be "exclude" or "unexclude"' },
      { status: 400 }
    );
  }

  try {
    if (action === 'exclude') {
      await recordManualExclusion(
        callId,
        session.user.id ?? null,
        session.user.email,
        reason
      );

      return NextResponse.json({
        ok: true,
        message: 'Call excluded successfully',
        callId,
      });
    } else {
      // Un-exclude logic (revert exclusion)
      await revertManualExclusion(
        callId,
        session.user.email,
        reason
      );

      return NextResponse.json({
        ok: true,
        message: 'Exclusion removed successfully',
        callId,
      });
    }
  } catch (error: any) {
    console.error('Error processing exclusion:', error);
    return NextResponse.json(
      { error: 'Failed to process exclusion', details: error.message },
      { status: 500 }
    );
  }
}

