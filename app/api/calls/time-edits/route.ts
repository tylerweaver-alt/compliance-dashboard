/**
 * GET /api/calls/time-edits
 * 
 * Fetch time edit audit logs for calls in a specific parish and date range.
 * Returns edits grouped by call ID for display.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { pool } from '@/lib/db';

export const runtime = 'nodejs';

// Human-readable field labels
const FIELD_LABELS: Record<string, string> = {
  call_in_que_time: 'Received',
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

export async function GET(req: NextRequest) {
  // Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parishId = searchParams.get('parish_id');
  const startDate = searchParams.get('start');
  const endDate = searchParams.get('end');

  if (!parishId) {
    return NextResponse.json({ error: 'parish_id is required' }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    // Build date filter for calls
    let dateFilter = '';
    const params: any[] = [parishId];
    
    if (startDate && endDate) {
      dateFilter = `
        AND to_date(c.response_date, 'MM/DD/YYYY') >= $2::date
        AND to_date(c.response_date, 'MM/DD/YYYY') <= $3::date
      `;
      params.push(startDate, endDate);
    }

    // Fetch all time edits for calls in this parish/date range
    // Join with calls to get call info and filter by parish/date
    const result = await client.query(`
      SELECT 
        tel.id,
        tel.call_id,
        tel.field_name,
        tel.old_value,
        tel.new_value,
        tel.reason,
        tel.edited_by_email,
        tel.edited_by_name,
        tel.edited_by_role,
        tel.created_at,
        tel.edit_session_id,
        c.response_number,
        c.response_date,
        c.radio_name,
        c.origin_address,
        c.response_area
      FROM time_edit_logs tel
      JOIN calls c ON tel.call_id = c.id
      WHERE c.parish_id = $1
      ${dateFilter}
      ORDER BY tel.call_id, tel.created_at DESC
    `, params);

    // Group edits by call_id
    const callEditsMap = new Map<number, {
      callId: number;
      callInfo: {
        responseNumber: string;
        responseDate: string;
        unit: string;
        address: string;
        zone: string;
      };
      edits: Array<{
        id: string;
        field: string;
        fieldLabel: string;
        oldValue: string | null;
        newValue: string | null;
        reason: string;
        editedBy: string;
        editedByName: string | null;
        editedAt: string;
      }>;
    }>();

    for (const row of result.rows) {
      const callId = row.call_id;
      
      if (!callEditsMap.has(callId)) {
        callEditsMap.set(callId, {
          callId,
          callInfo: {
            responseNumber: row.response_number,
            responseDate: row.response_date,
            unit: row.radio_name,
            address: row.origin_address,
            zone: row.response_area,
          },
          edits: [],
        });
      }

      callEditsMap.get(callId)!.edits.push({
        id: row.id,
        field: row.field_name,
        fieldLabel: FIELD_LABELS[row.field_name] || row.field_name,
        oldValue: row.old_value,
        newValue: row.new_value,
        reason: row.reason,
        editedBy: row.edited_by_email,
        editedByName: row.edited_by_name,
        editedAt: row.created_at,
      });
    }

    // Convert to array sorted by call response number
    const groupedEdits = Array.from(callEditsMap.values())
      .sort((a, b) => (a.callInfo.responseNumber || '').localeCompare(b.callInfo.responseNumber || ''));

    return NextResponse.json({
      ok: true,
      totalEdits: result.rows.length,
      totalCalls: groupedEdits.length,
      callEdits: groupedEdits,
    });
  } catch (err: any) {
    console.error('Error fetching time edits:', err);
    return NextResponse.json(
      { error: 'Failed to fetch time edits', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

