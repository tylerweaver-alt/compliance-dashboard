import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireAdminSession } from '../_utils';

export async function GET() {
  try {
    await requireAdminSession();

    const { rows } = await query(
      `SELECT id, name, display_order
       FROM regions
       ORDER BY display_order, name`
    );

    return NextResponse.json(rows);
  } catch (err: any) {
    if (err.message === 'UNAUTHORIZED' || err.message === 'FORBIDDEN') {
      return new NextResponse('Forbidden', { status: 403 });
    }
    console.error('Error fetching regions list', err);
    return new NextResponse('Server error', { status: 500 });
  }
}

