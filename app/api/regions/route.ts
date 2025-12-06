// app/api/regions/route.ts
// Public API to get regions and their parishes for the dashboard
import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

interface Parish {
  id: number;
  name: string;
  place_type: string;
  is_contracted: boolean;
  logo_url: string | null;
}

interface Region {
  id: number;
  name: string;
  display_order: number | null;
  place_type: string; // Parish, County, District (from first parish or default)
  parishes: Parish[];
}

export async function GET() {
  try {
    // Get all regions
    const regionsResult = await query<{ id: number; name: string; display_order: number | null }>(
      `SELECT id, name, display_order
       FROM regions
       ORDER BY display_order, name`
    );

    const regions: Region[] = [];

    // For each region, get its contracted parishes only
    for (const region of regionsResult.rows) {
      const parishesResult = await query<Parish>(
        `SELECT id, name, place_type, is_contracted, logo_url
         FROM parishes
         WHERE region = $1 AND is_contracted = true
         ORDER BY name`,
        [region.name]
      );

      // Determine the place type from the first parish, default to 'Parish'
      const placeType = parishesResult.rows[0]?.place_type || 'Parish';

      regions.push({
        id: region.id,
        name: region.name,
        display_order: region.display_order,
        place_type: placeType,
        parishes: parishesResult.rows,
      });
    }

    return NextResponse.json(regions);
  } catch (err: any) {
    console.error('Error fetching regions:', err);
    return NextResponse.json({ error: 'Failed to fetch regions' }, { status: 500 });
  }
}

