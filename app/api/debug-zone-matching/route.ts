// Read-only debug endpoint to compare zone names in calls vs configured zones
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET() {
  const client = await pool.connect();
  try {
    // Get all distinct response_area values from calls
    const callZones = await client.query(`
      SELECT parish_id, response_area, COUNT(*) as cnt
      FROM calls
      WHERE response_area IS NOT NULL
      GROUP BY parish_id, response_area
      ORDER BY parish_id, response_area
    `);

    // Get all configured zones
    const configuredZones = await client.query(`
      SELECT parish_id, response_area, threshold_minutes
      FROM response_area_mappings
      ORDER BY parish_id, response_area
    `);

    // Get parish names
    const parishes = await client.query(`SELECT id, name FROM parishes`);
    const parishMap: Record<number, string> = {};
    for (const p of parishes.rows) {
      parishMap[p.id] = p.name;
    }

    // Build configured lookup
    const configured: Record<string, number | null> = {};
    for (const row of configuredZones.rows) {
      const key = `${row.parish_id}:${row.response_area}`;
      configured[key] = row.threshold_minutes;
    }

    // Compare
    const results = callZones.rows.map((row: any) => {
      const key = `${row.parish_id}:${row.response_area}`;
      const threshold = configured[key];
      return {
        parish: parishMap[row.parish_id] || `ID:${row.parish_id}`,
        zoneInCalls: row.response_area,
        callCount: row.cnt,
        configuredThreshold: threshold !== undefined ? threshold : 'NOT CONFIGURED',
      };
    });

    return NextResponse.json({
      callZonesCount: results.length,
      configuredZonesCount: configuredZones.rows.length,
      comparison: results,
    });
  } catch (err: any) {
    console.error('Debug error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

