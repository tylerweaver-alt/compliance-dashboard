/**
 * Canonical Call Counting Logic
 *
 * This module provides the single source of truth for counting calls
 * across the Acadian Compliance Dashboard. All API routes should import
 * and use these functions to ensure consistent counting.
 *
 * COUNTING RULES:
 * 1. Use COUNT(DISTINCT response_number) for UUID deduplication
 * 2. Filter by date range (response_date)
 * 3. Filter by priority 1, 2, or 3
 * 4. Require arrived_at_scene_time IS NOT NULL
 * 5. Exclude standalone AirMed calls (unit LIKE 'AM%' with no ground unit)
 * 6. Parish total = SUM of all zone totals (derived, not separate query)
 */

import { Pool, PoolClient } from 'pg';
import { pool } from '@/lib/db';

// ============================================================================
// INTERFACES
// ============================================================================

export interface CallCountParams {
  parishId?: number;
  regionId?: number;
  startDate: string; // ISO date string (YYYY-MM-DD)
  endDate: string; // ISO date string (YYYY-MM-DD)
  zoneFilter?: string; // Optional: filter to specific zone
}

export interface ZoneStats {
  zoneName: string;
  zoneId?: number;
  totalCalls: number;
  compliantCalls: number;
  compliancePercent: number;
  thresholdMinutes: number;
}

export interface CallCountResult {
  totalCalls: number;
  compliantCalls: number;
  compliancePercent: number;
  zones: ZoneStats[];
}

export interface ParishStats {
  parishId: number;
  parishName: string;
  totalCalls: number;
  compliantCalls: number;
  compliancePercent: number;
  zones: ZoneStats[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert ISO date (YYYY-MM-DD) to MM/DD/YYYY format for database queries
 * The database stores response_date as 'MM/DD/YYYY' string
 */
export function formatDateForDb(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${month}/${day}/${year}`;
}

/**
 * Parse response time from call data
 * Returns time in minutes
 */
export function parseResponseTimeMinutes(
  callInQueTime: string | null,
  arrivedAtSceneTime: string | null
): number | null {
  if (!callInQueTime || !arrivedAtSceneTime) return null;

  try {
    // Parse datetime strings (format: "MM/DD/YYYY HH:MM:SS")
    const parseDateTime = (str: string): Date | null => {
      const parts = str.split(' ');
      if (parts.length < 2) return null;
      const [datePart, timePart] = parts;
      const [month, day, year] = datePart.split('/').map(Number);
      const [hours, minutes, seconds] = timePart.split(':').map(Number);
      return new Date(year, month - 1, day, hours, minutes, seconds);
    };

    const start = parseDateTime(callInQueTime);
    const end = parseDateTime(arrivedAtSceneTime);

    if (!start || !end) return null;

    const diffMs = end.getTime() - start.getTime();
    return diffMs / 1000 / 60; // Convert to minutes
  } catch {
    return null;
  }
}

// ============================================================================
// CORE COUNTING FUNCTIONS
// ============================================================================

/**
 * Count calls for a specific parish with zone breakdown
 * This is the canonical counting function that should be used everywhere
 */
export async function countCallsForParish(
  params: CallCountParams,
  client?: PoolClient | Pool
): Promise<CallCountResult> {
  const db = client || pool;
  const { parishId, startDate, endDate, zoneFilter } = params;

  if (!parishId) {
    throw new Error('parishId is required for countCallsForParish');
  }

  const startDateDb = formatDateForDb(startDate);
  const endDateDb = formatDateForDb(endDate);

  // Build zone filter clause if specified
  const zoneClause = zoneFilter ? `AND c.response_area = $4` : '';
  const queryParams = zoneFilter
    ? [parishId, startDateDb, endDateDb, zoneFilter]
    : [parishId, startDateDb, endDateDb];

  // Query for zone-level stats with compliance calculation
  // Uses COUNT(DISTINCT response_number) for deduplication
  //
  // IMPORTANT: This query uses response_area_mappings table for zone thresholds
  // and applies the X:59 compliance rule (threshold + 59 seconds)
  const zoneStatsQuery = `
    WITH zone_thresholds AS (
      SELECT
        ram.response_area as zone_name,
        ram.id as zone_id,
        COALESCE(ram.threshold_minutes * 60, 600) as threshold_seconds
      FROM response_area_mappings ram
      WHERE ram.parish_id = $1
    ),
    call_data AS (
      SELECT
        c.response_number,
        c.response_area,
        c.call_in_que_time,
        c.arrived_at_scene_time,
        c.priority,
        c.radio_name,
        c.is_excluded
      FROM calls c
      WHERE c.parish_id = $1
        AND to_date(c.response_date, 'MM/DD/YYYY') >= to_date($2, 'MM/DD/YYYY')
        AND to_date(c.response_date, 'MM/DD/YYYY') <= to_date($3, 'MM/DD/YYYY')
        AND REPLACE(c.priority, '0', '') IN ('1', '2', '3')
        AND c.arrived_at_scene_time IS NOT NULL
        AND c.arrived_at_scene_time != ''
        AND NOT (c.radio_name ~ '^AM[0-9]+$')
        AND NOT COALESCE(c.is_excluded, false)
        ${zoneClause}
    )
    SELECT
      COALESCE(cd.response_area, 'Unknown') as zone_name,
      zt.zone_id,
      COUNT(DISTINCT cd.response_number) as total_calls,
      COALESCE(zt.threshold_seconds, 600) / 60.0 as threshold_minutes,
      COUNT(DISTINCT CASE
        WHEN (
          EXTRACT(EPOCH FROM (
            to_timestamp(cd.arrived_at_scene_time, 'MM/DD/YYYY HH24:MI:SS') -
            to_timestamp(cd.call_in_que_time, 'MM/DD/YYYY HH24:MI:SS')
          )) <= COALESCE(zt.threshold_seconds, 600) + 59
        ) THEN cd.response_number
      END) as compliant_calls
    FROM call_data cd
    LEFT JOIN zone_thresholds zt ON cd.response_area = zt.zone_name
    GROUP BY cd.response_area, zt.zone_id, zt.threshold_seconds
    ORDER BY cd.response_area
  `;

  const result = await db.query(zoneStatsQuery, queryParams);

  // Build zone stats array
  const zones: ZoneStats[] = result.rows.map((row) => ({
    zoneName: row.zone_name,
    zoneId: row.zone_id,
    totalCalls: parseInt(row.total_calls, 10) || 0,
    compliantCalls: parseInt(row.compliant_calls, 10) || 0,
    compliancePercent:
      row.total_calls > 0
        ? Math.round((parseInt(row.compliant_calls, 10) / parseInt(row.total_calls, 10)) * 100)
        : 0,
    thresholdMinutes: parseFloat(row.threshold_minutes) || 10,
  }));

  // Calculate parish totals from zone sums (single source of truth)
  const totalCalls = zones.reduce((sum, z) => sum + z.totalCalls, 0);
  const compliantCalls = zones.reduce((sum, z) => sum + z.compliantCalls, 0);
  const compliancePercent = totalCalls > 0 ? Math.round((compliantCalls / totalCalls) * 100) : 0;

  return {
    totalCalls,
    compliantCalls,
    compliancePercent,
    zones,
  };
}

/**
 * Count calls for all parishes in a region
 * Returns array of ParishStats with zone breakdowns
 *
 * Note: parishes table uses `region` (text) column referencing regions.name
 */
export async function countCallsForRegion(
  params: Omit<CallCountParams, 'parishId'> & { regionId: number },
  client?: PoolClient | Pool
): Promise<ParishStats[]> {
  const db = client || pool;
  const { regionId, startDate, endDate } = params;

  // Get all contracted parishes in the region by joining with regions table
  // parishes.region contains the region name (text), not region_id
  const parishesResult = await db.query(
    `SELECT p.id, p.name
     FROM parishes p
     JOIN regions r ON p.region = r.name
     WHERE r.id = $1 AND p.is_contracted = true
     ORDER BY p.name`,
    [regionId]
  );

  const parishStats: ParishStats[] = [];

  // Get stats for each parish using canonical counting
  for (const parish of parishesResult.rows) {
    const stats = await countCallsForParish({ parishId: parish.id, startDate, endDate }, db);

    parishStats.push({
      parishId: parish.id,
      parishName: parish.name,
      totalCalls: stats.totalCalls,
      compliantCalls: stats.compliantCalls,
      compliancePercent: stats.compliancePercent,
      zones: stats.zones,
    });
  }

  return parishStats;
}

/**
 * Get region-level totals (sum of all parishes)
 */
export async function getRegionTotals(
  params: Omit<CallCountParams, 'parishId'> & { regionId: number },
  client?: PoolClient | Pool
): Promise<CallCountResult> {
  const parishStats = await countCallsForRegion(params, client);

  const totalCalls = parishStats.reduce((sum, p) => sum + p.totalCalls, 0);
  const compliantCalls = parishStats.reduce((sum, p) => sum + p.compliantCalls, 0);
  const compliancePercent = totalCalls > 0 ? Math.round((compliantCalls / totalCalls) * 100) : 0;

  // Flatten all zones from all parishes
  const zones = parishStats.flatMap((p) => p.zones);

  return {
    totalCalls,
    compliantCalls,
    compliancePercent,
    zones,
  };
}
