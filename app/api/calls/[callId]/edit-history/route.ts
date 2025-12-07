/**
 * GET /api/calls/[callId]/edit-history
 * 
 * Get the time edit history for a call, grouped by edit session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

interface TimeEditLog {
  id: string;
  call_id: number;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  edited_by_email: string;
  edited_by_name: string | null;
  edited_by_role: string | null;
  reason: string;
  edit_session_id: string | null;
  created_at: string;
  metadata: Record<string, any> | null;
}

interface GroupedEditSession {
  sessionId: string | null;
  editedAt: string;
  editedBy: {
    email: string;
    name: string | null;
    role: string | null;
  };
  reason: string;
  edits: Array<{
    field: string;
    fieldLabel: string;
    oldValue: string | null;
    newValue: string | null;
  }>;
}

// Human-readable field labels
const FIELD_LABELS: Record<string, string> = {
  call_in_que_time: 'Call Received',
  call_taking_complete_time: 'Call Taking Complete',
  assigned_time_first_unit: 'First Unit Assigned',
  assigned_time: 'Dispatched',
  enroute_time: 'Enroute',
  staged_time: 'Staged',
  arrived_at_scene_time: 'On Scene',
  depart_scene_time: 'Departed Scene',
  arrived_destination_time: 'Arrived Destination',
  call_cleared_time: 'Call Cleared',
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Await params in Next.js 15+
  const { callId } = await params;
  if (!callId) {
    return NextResponse.json({ error: 'Call ID is required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Get all edits for this call, ordered by time
    const result = await client.query<TimeEditLog>(
      `SELECT * FROM time_edit_logs 
       WHERE call_id = $1 
       ORDER BY created_at DESC`,
      [callId]
    );

    // Group edits by session (edits made at the same time)
    const sessionMap = new Map<string, GroupedEditSession>();

    for (const log of result.rows) {
      const sessionKey = log.edit_session_id || log.id; // Use edit ID as fallback

      if (!sessionMap.has(sessionKey)) {
        sessionMap.set(sessionKey, {
          sessionId: log.edit_session_id,
          editedAt: log.created_at,
          editedBy: {
            email: log.edited_by_email,
            name: log.edited_by_name,
            role: log.edited_by_role,
          },
          reason: log.reason,
          edits: [],
        });
      }

      const session = sessionMap.get(sessionKey)!;
      session.edits.push({
        field: log.field_name,
        fieldLabel: FIELD_LABELS[log.field_name] || log.field_name,
        oldValue: log.old_value,
        newValue: log.new_value,
      });
    }

    // Convert to array
    const editHistory = Array.from(sessionMap.values());

    return NextResponse.json({
      ok: true,
      callId,
      editCount: result.rows.length,
      sessions: editHistory,
    });
  } catch (err: any) {
    console.error('Error fetching edit history:', err);
    return NextResponse.json(
      { error: 'Failed to fetch edit history', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

