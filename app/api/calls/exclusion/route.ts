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
import { pool } from '@/lib/db';

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
    // Get user ID from database
    let userId: string | null = null;
    const client = await pool.connect();
    try {
      const userResult = await client.query(
        `SELECT id FROM users WHERE LOWER(email) = LOWER($1)`,
        [session.user.email]
      );
      if (userResult.rows.length > 0) {
        userId = userResult.rows[0].id;
      }
      console.log(`[Exclusion API] User lookup: email=${session.user.email}, userId=${userId}`);
    } catch (dbError: any) {
      console.error('[Exclusion API] Failed to fetch user ID:', dbError);
      throw new Error(`Failed to fetch user ID: ${dbError.message}`);
    } finally {
      client.release();
    }

    console.log(`[Exclusion API] Processing ${action} for callId=${callId}, userId=${userId}, email=${session.user.email}`);

    if (action === 'exclude') {
      await recordManualExclusion(
        callId,
        userId,
        session.user.email,
        reason
      );

      console.log(`[Exclusion API] Successfully excluded call ${callId}`);
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

      console.log(`[Exclusion API] Successfully removed exclusion for call ${callId}`);
      return NextResponse.json({
        ok: true,
        message: 'Exclusion removed successfully',
        callId,
      });
    }
  } catch (error: any) {
    console.error('[Exclusion API] Error processing exclusion:', {
      error: error.message,
      stack: error.stack,
      callId,
      action,
      userEmail: session.user.email,
    });
    return NextResponse.json(
      {
        error: 'Failed to process exclusion',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

