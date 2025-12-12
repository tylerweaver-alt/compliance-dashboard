import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function GET(req: NextRequest) {
  const client = await pool.connect();

  try {
    const { searchParams } = new URL(req.url);
    let startDate = searchParams.get('start'); // YYYY-MM-DD
    let endDate = searchParams.get('end');     // YYYY-MM-DD
    const autoDetect = searchParams.get('autoDetect') === 'true';
    const regionIdParam = searchParams.get('regionId');
    const regionId = regionIdParam ? parseInt(regionIdParam, 10) : null;

    // Get contracted parishes for this region first (we need them for filtering)
    const parishesQuery = regionId
      ? `SELECT p.id, p.name FROM parishes p JOIN regions r ON p.region = r.name WHERE r.id = $1 AND p.is_contracted = true ORDER BY p.name`
      : `SELECT id, name FROM parishes WHERE is_contracted = true ORDER BY name`;
    const parishesResult = await client.query(parishesQuery, regionId ? [regionId] : []);

    // Build parish ID to name/key mapping
    const parishIdToKey: Record<number, string> = { 0: 'other' };
    const parishNames: Record<string, string> = { other: 'Other Areas' };
    const regionParishIds: number[] = [];
    for (const row of parishesResult.rows) {
      const key = row.name.toLowerCase().replace(/\s+/g, '_');
      parishIdToKey[row.id] = key;
      parishNames[key] = row.name;
      regionParishIds.push(row.id);
    }

    // Build region filter using parish_ids (works even if region_id is null in calls table)
    // This filters calls by their parish_id which belongs to the selected region
    const regionFilter = regionId && regionParishIds.length > 0
      ? `AND parish_id IN (${regionParishIds.join(',')})`
      : '';

    // If autoDetect, get the actual date range from the data (for this region)
    if (autoDetect || !startDate || !endDate) {
      const dateRangeResult = await client.query(`
        SELECT
          MIN(to_date(response_date, 'MM/DD/YYYY')) as min_date,
          MAX(to_date(response_date, 'MM/DD/YYYY')) as max_date
        FROM calls
        WHERE response_date IS NOT NULL AND response_date != ''
        ${regionFilter}
      `);

      if (dateRangeResult.rows[0]?.min_date) {
        const minDate = new Date(dateRangeResult.rows[0].min_date);
        const maxDate = new Date(dateRangeResult.rows[0].max_date);
        startDate = minDate.toISOString().split('T')[0];
        endDate = maxDate.toISOString().split('T')[0];
      }
    }

    // Build date filter
    let dateFilter = '';
    const params: any[] = [];

    if (startDate && endDate) {
      // Convert MM/DD/YYYY format stored in DB to compare with YYYY-MM-DD params
      dateFilter = `
        AND to_date(response_date, 'MM/DD/YYYY') >= $1::date
        AND to_date(response_date, 'MM/DD/YYYY') <= $2::date
      `;
      params.push(startDate, endDate);
    }

    // Fetch zone thresholds for compliance calculation
    const thresholdsResult = await client.query(`
      SELECT response_area, threshold_minutes
      FROM response_area_mappings
      WHERE threshold_minutes IS NOT NULL
    `);

    // Normalize zone name for matching (handle "5mi" vs "5min" etc.)
    const normalizeZoneName = (name: string): string => {
      if (!name) return '';
      return name
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/(\d+)\s*mi\b/gi, '$1min')
        .replace(/(\d+)\s*min\b/gi, '$1min');
    };

    // Build a map of normalized zone -> threshold (in minutes)
    const zoneThresholds: Record<string, number> = {};
    const normalizedZoneThresholds: Record<string, number> = {};
    for (const row of thresholdsResult.rows) {
      if (row.response_area && row.threshold_minutes) {
        const thresholdNum = parseFloat(row.threshold_minutes);
        zoneThresholds[row.response_area] = thresholdNum;
        normalizedZoneThresholds[normalizeZoneName(row.response_area)] = thresholdNum;
      }
    }

    // Default threshold for zones without specific settings
    const defaultThreshold = 10; // minutes

    // Fetch parish-level thresholds as fallbacks
    const parishThresholdsResult = await client.query(`
      SELECT parish_id, global_response_threshold_seconds
      FROM parish_settings
      WHERE global_response_threshold_seconds IS NOT NULL
    `);

    // Build map of parish_id -> threshold in minutes
    const parishThresholds: Record<number, number> = {};
    for (const row of parishThresholdsResult.rows) {
      if (row.global_response_threshold_seconds) {
        parishThresholds[row.parish_id] = row.global_response_threshold_seconds / 60;
      }
    }

    // Get threshold for a zone name (tries exact match, then normalized match, then parish fallback)
    const getThresholdForZone = (zoneName: string, parishId?: number): number => {
      // Try exact zone match
      if (zoneThresholds[zoneName] !== undefined) {
        return zoneThresholds[zoneName];
      }
      // Try normalized zone match
      const normalized = normalizeZoneName(zoneName);
      if (normalizedZoneThresholds[normalized] !== undefined) {
        return normalizedZoneThresholds[normalized];
      }
      // Fall back to parish-level threshold
      if (parishId !== undefined && parishThresholds[parishId] !== undefined) {
        return parishThresholds[parishId];
      }
      // Final fallback
      return defaultThreshold;
    };

    // Get call counts per parish (we'll calculate compliance in the areas query with zone-specific thresholds)
    const sql = `
      SELECT
        parish_id,
        COUNT(*) FILTER (
          WHERE arrived_at_scene_time IS NOT NULL
          AND REPLACE(priority, '0', '') IN ('1', '2', '3')
          AND NOT (radio_name ~ '^AM[0-9]+$')
        ) as total_calls,
        COUNT(*) FILTER (
          WHERE NOT COALESCE(is_excluded, false)
          AND arrived_at_scene_time IS NOT NULL
          AND REPLACE(priority, '0', '') IN ('1', '2', '3')
          AND NOT (radio_name ~ '^AM[0-9]+$')
        ) as active_calls,
        COUNT(*) FILTER (
          WHERE is_excluded = true
          AND arrived_at_scene_time IS NOT NULL
          AND REPLACE(priority, '0', '') IN ('1', '2', '3')
          AND NOT (radio_name ~ '^AM[0-9]+$')
        ) as excluded_calls
      FROM calls
      WHERE 1=1 ${dateFilter} ${regionFilter}
      GROUP BY parish_id
    `;

    const result = await client.query(sql, params);

    // Build response object with parish keys
    const stats: Record<string, {
      id: number;
      name: string;
      overall: number | null;
      totalCalls: number;
      compliantCalls: number;
      nonCompliantCalls: number;
      excludedCalls: number;
      areas: Array<{ name: string; compliance: number; calls: number }>;
    }> = {};

    // Initialize all parishes (from DB) with zero values
    for (const [key, name] of Object.entries(parishNames)) {
      // Find the parish id from the reverse mapping
      const parishId = Object.entries(parishIdToKey).find(([id, k]) => k === key)?.[0];
      stats[key] = {
        id: parseInt(parishId || '0'),
        name,
        overall: key === 'other' ? null : 0,
        totalCalls: 0,
        compliantCalls: 0,
        nonCompliantCalls: 0,
        excludedCalls: 0,
        areas: [],
      };
    }

    // Fill in parish-level call counts (compliance will be calculated after areas)
    for (const row of result.rows) {
      const key = parishIdToKey[row.parish_id];
      if (key && stats[key]) {
        const totalCalls = parseInt(row.total_calls) || 0;
        const excludedCalls = parseInt(row.excluded_calls) || 0;

        stats[key].totalCalls = totalCalls;
        stats[key].excludedCalls = excludedCalls;
      }
    }

    // Get response area breakdown with response times for zone-specific threshold calculation
    // We need to get individual call response times to apply zone-specific thresholds
    // Formula: Response Time = On Scene Time - Call in Queue Time
    //
    // DEDUPLICATION LOGIC (must match calls/page.jsx):
    // 1. Group calls by response_date + origin_address + call_in_que_time (unique incident key)
    // 2. When multiple units respond to same incident, keep only the fastest responder
    // 3. Exclude standalone AirMed (AM#) calls, but include ground units that race with AirMed
    const areasSql = `
      WITH base_calls AS (
        SELECT
          id,
          parish_id,
          response_area,
          arrived_at_scene_time,
          call_in_que_time,
          is_excluded,
          priority,
          radio_name,
          response_date,
          LOWER(TRIM(COALESCE(origin_address, ''))) as normalized_address,
          CASE
            WHEN arrived_at_scene_time IS NOT NULL AND call_in_que_time IS NOT NULL THEN
              EXTRACT(EPOCH FROM (
                TO_TIMESTAMP(arrived_at_scene_time, 'MM/DD/YY HH24:MI:SS') -
                TO_TIMESTAMP(call_in_que_time, 'MM/DD/YY HH24:MI:SS')
              )) / 60
            ELSE NULL
          END as response_time_minutes,
          -- Flag AirMed units
          CASE WHEN radio_name ~ '^AM[0-9]+$' THEN true ELSE false END as is_airmed
        FROM calls
        WHERE 1=1 ${dateFilter} ${regionFilter}
          AND response_area IS NOT NULL
          AND response_area != ''
          AND arrived_at_scene_time IS NOT NULL
          AND REPLACE(priority, '0', '') IN ('1', '2', '3')
      ),
      -- Group by incident key and rank by response time (fastest first)
      -- Prefer non-AirMed units when response times are equal
      ranked_calls AS (
        SELECT *,
          ROW_NUMBER() OVER (
            PARTITION BY response_date, normalized_address, call_in_que_time
            ORDER BY
              response_time_minutes ASC NULLS LAST,
              is_airmed ASC  -- non-AirMed (false) comes before AirMed (true)
          ) as rn,
          COUNT(*) OVER (
            PARTITION BY response_date, normalized_address, call_in_que_time
          ) as group_size
        FROM base_calls
        WHERE response_date IS NOT NULL
          AND normalized_address != ''
          AND call_in_que_time IS NOT NULL
      ),
      -- Also include calls that can't be grouped (missing key fields) - but exclude standalone AirMed
      ungrouped_calls AS (
        SELECT *, 1 as rn, 1 as group_size
        FROM base_calls
        WHERE (response_date IS NULL OR normalized_address = '' OR call_in_que_time IS NULL)
          AND is_airmed = false
      )
      -- Final: Keep fastest responder from each group (rn=1)
      -- For grouped calls: always keep rn=1 (includes AirMed if it was fastest in a race)
      -- For ungrouped: already filtered out standalone AirMed above
      SELECT parish_id, response_area, is_excluded, response_time_minutes
      FROM ranked_calls
      WHERE rn = 1
      UNION ALL
      SELECT parish_id, response_area, is_excluded, response_time_minutes
      FROM ungrouped_calls
    `;

    const areasResult = await client.query(areasSql, params);

    // Aggregate calls by parish and zone, applying zone-specific thresholds
    const zoneStats: Record<string, Record<string, { total: number; active: number; compliant: number }>> = {};

    for (const row of areasResult.rows) {
      const key = parishIdToKey[row.parish_id];
      if (!key) continue;

      const zoneName = row.response_area;
      if (!zoneStats[key]) zoneStats[key] = {};
      if (!zoneStats[key][zoneName]) zoneStats[key][zoneName] = { total: 0, active: 0, compliant: 0 };

      const isExcluded = row.is_excluded === true;
      const responseTime = parseFloat(row.response_time_minutes) || null;

      // Get threshold for this zone (zone-specific, then parish fallback, then default)
      // Threshold of X minutes means X:59 (add 59 seconds for compliance)
      const thresholdMinutes = getThresholdForZone(zoneName, row.parish_id);
      const thresholdWithSeconds = thresholdMinutes + (59 / 60); // X:59

      zoneStats[key][zoneName].total++;

      if (!isExcluded) {
        zoneStats[key][zoneName].active++;
        if (responseTime !== null && responseTime <= thresholdWithSeconds) {
          zoneStats[key][zoneName].compliant++;
        }
      }
    }

    // Add areas to each parish and calculate parish-level compliance
    // Use one decimal place to match the radial gauge display
    for (const [parishKey, zones] of Object.entries(zoneStats)) {
      if (!stats[parishKey]) continue;

      let parishCompliant = 0;
      let parishActive = 0;

      for (const [zoneName, zoneCounts] of Object.entries(zones)) {
        // One decimal place: Math.round(x * 1000) / 10 gives XX.X
        const compliancePercent = zoneCounts.active > 0
          ? Math.round((zoneCounts.compliant / zoneCounts.active) * 1000) / 10
          : 0;

        stats[parishKey].areas.push({
          name: zoneName,
          compliance: compliancePercent,
          calls: zoneCounts.total,
        });

        parishCompliant += zoneCounts.compliant;
        parishActive += zoneCounts.active;
      }

      // Update parish-level stats
      stats[parishKey].compliantCalls = parishCompliant;
      stats[parishKey].nonCompliantCalls = parishActive - parishCompliant;
      if (parishKey !== 'other' && parishActive > 0) {
        // One decimal place to match radial gauge
        stats[parishKey].overall = Math.round((parishCompliant / parishActive) * 1000) / 10;
      }
    }

    // Get last upload info for this region
    const lastUploadResult = await client.query(`
      SELECT uploaded_at, uploaded_by_user_id
      FROM calls
      WHERE 1=1 ${regionFilter}
      ORDER BY uploaded_at DESC
      LIMIT 1
    `);

    let lastUpdated = null;
    if (lastUploadResult.rows.length > 0) {
      const row = lastUploadResult.rows[0];
      lastUpdated = {
        date: new Date(row.uploaded_at).toLocaleDateString(),
        time: new Date(row.uploaded_at).toLocaleTimeString(),
        user: row.uploaded_by_user_id || 'System',
      };
    }

    return NextResponse.json({
      ok: true,
      stats,
      lastUpdated,
      filters: { startDate, endDate },
    });

  } catch (err: any) {
    console.error('Error fetching dashboard stats:', err);
    return NextResponse.json(
      { error: 'Failed to fetch stats', details: err.message },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

