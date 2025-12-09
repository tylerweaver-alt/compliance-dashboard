/**
 * CADalytix Regional Score API
 *
 * GET /api/cadalytix/regions/[regionId]
 * Returns the CADalytix score breakdown for a specific region.
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getCadalytixScoreForRegion } from '@/lib/cadalytix';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ regionId: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const { regionId } = await context.params;
    const numericRegionId = parseInt(regionId, 10);

    if (isNaN(numericRegionId)) {
      return NextResponse.json({ error: 'Invalid region ID' }, { status: 400 });
    }

    // Fetch region name from database
    const regionResult = await query<{ name: string }>(`SELECT name FROM regions WHERE id = $1`, [
      numericRegionId,
    ]);

    if (regionResult.rows.length === 0) {
      return NextResponse.json({ error: 'Region not found' }, { status: 404 });
    }

    const regionName = regionResult.rows[0].name;

    // Get the CADalytix score
    const score = await getCadalytixScoreForRegion(numericRegionId, regionName);

    return NextResponse.json(score);
  } catch (error) {
    console.error('Error fetching CADalytix score:', error);
    return NextResponse.json({ error: 'Failed to fetch CADalytix score' }, { status: 500 });
  }
}
