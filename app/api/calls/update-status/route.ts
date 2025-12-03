import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function POST(req: NextRequest) {
  const client = await pool.connect();

  try {
    const body = await req.json();
    const { callId, is_excluded, exclusion_reason, is_confirmed } = body;

    if (!callId) {
      return NextResponse.json(
        { error: 'callId is required' },
        { status: 400 }
      );
    }

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

    const sql = `
      UPDATE calls 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, is_excluded, exclusion_reason, is_confirmed
    `;

    const result = await client.query(sql, values);

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: 'Call not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      call: result.rows[0],
    });

  } catch (err: any) {
    console.error('Error updating call status:', err);
    return NextResponse.json(
      { error: 'Failed to update call', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

