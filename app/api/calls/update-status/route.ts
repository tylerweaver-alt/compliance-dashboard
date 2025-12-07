import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../auth/[...nextauth]/route';
import { recordManualExclusion } from '@/lib/exclusions';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    // Get session for audit logging
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    const body = await req.json();
    const { callId, is_excluded, exclusion_reason, is_confirmed } = body;

    if (!callId) {
      return NextResponse.json(
        { error: 'callId is required' },
        { status: 400 }
      );
    }

    // Handle manual exclusion with audit logging
    if (is_excluded === true && exclusion_reason) {
      await recordManualExclusion(
        callId,
        sessionUser?.id ?? null,
        sessionUser?.email ?? null,
        exclusion_reason
      );

      // Get updated call data
      const { rows } = await query(
        `SELECT id, is_excluded, exclusion_reason, is_confirmed FROM calls WHERE id = $1`,
        [callId]
      );

      return NextResponse.json({
        ok: true,
        call: rows[0],
      });
    }

    // Handle other updates (confirm, or exclusion without reason)
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (is_excluded !== undefined) {
      updates.push(`is_excluded = $${paramIndex++}`);
      values.push(is_excluded);
    }

    if (exclusion_reason !== undefined) {
      updates.push(`exclusion_reason = $${paramIndex++}`);
      values.push(exclusion_reason);
    }

    if (is_confirmed !== undefined) {
      updates.push(`is_confirmed = $${paramIndex++}`);
      values.push(is_confirmed);
    }

    if (updates.length === 0) {
      return NextResponse.json(
        { error: 'No updates provided' },
        { status: 400 }
      );
    }

    values.push(callId);

    const { rows } = await query(
      `UPDATE calls
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING id, is_excluded, exclusion_reason, is_confirmed`,
      values
    );

    if (rows.length === 0) {
      return NextResponse.json(
        { error: 'Call not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      call: rows[0],
    });

  } catch (err: any) {
    console.error('Error updating call status:', err);
    return NextResponse.json(
      { error: 'Failed to update call', details: err.message },
      { status: 500 }
    );
  }
}

