/**
 * POST /api/calls/update-times
 * 
 * Update call time fields and log changes to time_edit_logs table.
 * Supports updating any of the call timestamp fields (Rcvd, Disp, Enrt, etc.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

// Map of field names to database columns
const FIELD_MAP: Record<string, string> = {
  received: 'call_in_que_time',
  dispatched: 'assigned_time',
  enroute: 'enroute_time',
  staged: 'staged_time',
  on_scene: 'arrived_at_scene_time',
  depart: 'depart_scene_time',
  arrived: 'arrived_destination_time',
  available: 'call_cleared_time',
  response_time: 'queue_response_time',
};

// Human-readable labels for audit log
const FIELD_LABELS: Record<string, string> = {
  call_in_que_time: 'Received',
  assigned_time: 'Dispatched',
  enroute_time: 'Enroute',
  staged_time: 'Staged',
  arrived_at_scene_time: 'On Scene',
  depart_scene_time: 'Departed Scene',
  arrived_destination_time: 'Arrived Destination',
  call_cleared_time: 'Call Cleared / Available',
  queue_response_time: 'Response Time',
};

export async function POST(req: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = await pool.connect();
  
  try {
    const body = await req.json();
    const { callId, updates, reason } = body;

    if (!callId) {
      return NextResponse.json({ error: 'callId is required' }, { status: 400 });
    }

    if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'updates object is required' }, { status: 400 });
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json({ error: 'reason is required' }, { status: 400 });
    }

    // Start transaction
    await client.query('BEGIN');

    // Get current call data for audit trail
    const callResult = await client.query(
      'SELECT * FROM calls WHERE id = $1',
      [callId]
    );

    if (callResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    const currentCall = callResult.rows[0];
    const editSessionId = crypto.randomUUID();
    const changedFields: string[] = [];

    // Process each update
    for (const [fieldKey, newValue] of Object.entries(updates)) {
      const dbColumn = FIELD_MAP[fieldKey] || fieldKey;

      // Validate column exists
      if (!FIELD_LABELS[dbColumn]) {
        await client.query('ROLLBACK');
        return NextResponse.json({ error: `Invalid field: ${fieldKey}` }, { status: 400 });
      }

      const oldValue = currentCall[dbColumn];

      // Convert MM:SS to HH:MM:SS for response_time field
      let valueToStore = newValue;
      if (dbColumn === 'queue_response_time' && newValue) {
        // Input format: MM:SS (e.g., "08:45")
        // Storage format: HH:MM:SS (e.g., "00:08:45")
        const match = newValue.match(/^(\d{1,3}):(\d{2})$/);
        if (match) {
          const minutes = parseInt(match[1], 10);
          const seconds = match[2];
          const hours = Math.floor(minutes / 60);
          const remainingMinutes = minutes % 60;
          valueToStore = `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}:${seconds}`;
        }
      }

      // Only update if value changed
      if (oldValue !== valueToStore) {
        // Update the call record
        await client.query(
          `UPDATE calls SET ${dbColumn} = $1 WHERE id = $2`,
          [valueToStore, callId]
        );

        // Log to time_edit_logs
        await client.query(`
          INSERT INTO time_edit_logs (
            id,
            call_id,
            field_name,
            old_value,
            new_value,
            call_snapshot_before,
            edited_by_user_id,
            edited_by_email,
            edited_by_name,
            edited_by_role,
            reason,
            metadata,
            edit_session_id,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
        `, [
          crypto.randomUUID(),
          callId,
          dbColumn,
          oldValue,
          valueToStore,
          JSON.stringify(currentCall),
          session.user.id || null,
          session.user.email,
          session.user.name || session.user.email,
          (session.user as any).role || 'user',
          reason.trim(),
          JSON.stringify({
            field_label: FIELD_LABELS[dbColumn],
            changed_at: new Date().toISOString(),
          }),
          editSessionId,
        ]);

        changedFields.push(FIELD_LABELS[dbColumn]);
      }
    }

    // Commit transaction
    await client.query('COMMIT');

    return NextResponse.json({
      ok: true,
      message: `Updated ${changedFields.length} field(s): ${changedFields.join(', ')}`,
      changedFields,
      editSessionId,
    });

  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('Error updating call times:', err);
    return NextResponse.json(
      { error: 'Failed to update call times', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

