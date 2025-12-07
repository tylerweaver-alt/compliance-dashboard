/**
 * API Route: Get/Update Exclusion Details for a Call
 * 
 * GET: Retrieve exclusion status and details for a specific call
 * POST: Update exclusion reason (for calls already excluded)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getExclusionForCall, recordManualExclusion } from '@/lib/exclusions';
import { query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';

export const runtime = 'nodejs';

// GET /api/calls/exclusion?callId=123
export async function GET(req: NextRequest) {
  try {
    const callId = req.nextUrl.searchParams.get('callId');
    
    if (!callId) {
      return NextResponse.json(
        { error: 'callId is required' },
        { status: 400 }
      );
    }

    const exclusion = await getExclusionForCall(parseInt(callId, 10));

    return NextResponse.json({
      ok: true,
      exclusion,
    });

  } catch (err: any) {
    console.error('Error getting exclusion details:', err);
    return NextResponse.json(
      { error: 'Failed to get exclusion details', details: err.message },
      { status: 500 }
    );
  }
}

// POST /api/calls/exclusion - Update exclusion reason
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    const body = await req.json();
    const { callId, reason } = body;

    if (!callId) {
      return NextResponse.json(
        { error: 'callId is required' },
        { status: 400 }
      );
    }

    if (!reason || reason.trim() === '') {
      return NextResponse.json(
        { error: 'Reason is required' },
        { status: 400 }
      );
    }

    // Check if call exists and is already excluded
    const { rows: callRows } = await query(
      'SELECT id, is_excluded, is_auto_excluded FROM calls WHERE id = $1',
      [callId]
    );

    if (callRows.length === 0) {
      return NextResponse.json(
        { error: 'Call not found' },
        { status: 404 }
      );
    }

    const call = callRows[0];

    // Don't allow editing auto-exclusion reasons
    if (call.is_auto_excluded) {
      return NextResponse.json(
        { error: 'Cannot edit auto-exclusion reasons' },
        { status: 400 }
      );
    }

    // Update the exclusion reason
    await query(
      `UPDATE calls SET exclusion_reason = $1 WHERE id = $2`,
      [reason, callId]
    );

    // Log the reason update
    await query(
      `INSERT INTO exclusion_logs (
        call_id,
        exclusion_type,
        reason,
        created_by_user_id,
        created_by_email,
        engine_metadata
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        callId,
        'MANUAL',
        reason,
        sessionUser?.id ?? null,
        sessionUser?.email ?? null,
        JSON.stringify({ action: 'reason_update' }),
      ]
    );

    const updatedExclusion = await getExclusionForCall(callId);

    return NextResponse.json({
      ok: true,
      exclusion: updatedExclusion,
    });

  } catch (err: any) {
    console.error('Error updating exclusion reason:', err);
    return NextResponse.json(
      { error: 'Failed to update exclusion reason', details: err.message },
      { status: 500 }
    );
  }
}

