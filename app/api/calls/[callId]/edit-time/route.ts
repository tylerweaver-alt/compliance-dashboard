/**
 * PUT /api/calls/[callId]/edit-time
 * 
 * Edit a time field on a call with required audit logging.
 * Only accessible by OM/Director/VP/Admin roles.
 * 
 * Body: {
 *   field: 'arrived_at_scene_time',
 *   newValue: '10/31/25 21:43:00',
 *   reason: 'GPS timestamp was incorrect...'
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

// Allowed time fields that can be edited
const EDITABLE_TIME_FIELDS = [
  'call_in_que_time',
  'call_taking_complete_time',
  'assigned_time_first_unit',
  'assigned_time',
  'enroute_time',
  'staged_time',
  'arrived_at_scene_time',
  'depart_scene_time',
  'arrived_destination_time',
  'call_cleared_time',
];

// Roles allowed to edit time fields
const ALLOWED_ROLES = ['om', 'director', 'vp', 'admin'];

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  // 1. Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Role check
  const userRole = (session.user as any).role?.toLowerCase() || '';
  const isAdmin = (session.user as any).is_admin === true;

  if (!isAdmin && !ALLOWED_ROLES.includes(userRole)) {
    return NextResponse.json(
      { error: 'Forbidden: Only OM, Director, VP, or Admin can edit time fields' },
      { status: 403 }
    );
  }

  // 3. Parse request - await params in Next.js 15+
  const { callId } = await params;
  if (!callId) {
    return NextResponse.json({ error: 'Call ID is required' }, { status: 400 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { field, newValue, reason } = body;

  // 4. Validate field
  if (!field || !EDITABLE_TIME_FIELDS.includes(field)) {
    return NextResponse.json(
      { error: `Invalid field. Allowed: ${EDITABLE_TIME_FIELDS.join(', ')}` },
      { status: 400 }
    );
  }

  // 5. Validate reason (required)
  if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
    return NextResponse.json(
      { error: 'Reason is required for time edits' },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    // 6. Get current call data (full snapshot for audit)
    const callResult = await client.query(
      'SELECT * FROM calls WHERE id = $1',
      [callId]
    );

    if (callResult.rows.length === 0) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 });
    }

    const call = callResult.rows[0];
    const oldValue = call[field];

    // 7. Update the call
    await client.query(
      `UPDATE calls SET 
        ${field} = $1,
        has_time_edits = TRUE,
        last_time_edit_at = NOW()
      WHERE id = $2`,
      [newValue, callId]
    );

    // 8. Insert audit log
    const editSessionId = crypto.randomUUID();
    await client.query(
      `INSERT INTO time_edit_logs (
        call_id, field_name, old_value, new_value,
        call_snapshot_before, edited_by_user_id, edited_by_email,
        edited_by_name, edited_by_role, reason, edit_session_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        callId,
        field,
        oldValue,
        newValue,
        JSON.stringify(call),
        (session.user as any).id || null,
        session.user.email,
        session.user.name || session.user.email,
        userRole,
        reason.trim(),
        editSessionId,
      ]
    );

    // 9. Get updated call
    const updatedResult = await client.query(
      'SELECT * FROM calls WHERE id = $1',
      [callId]
    );

    return NextResponse.json({
      ok: true,
      call: updatedResult.rows[0],
      edit: {
        field,
        oldValue,
        newValue,
        reason: reason.trim(),
        editedBy: session.user.email,
        editedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('Error editing time field:', err);
    return NextResponse.json(
      { error: 'Failed to edit time field', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

