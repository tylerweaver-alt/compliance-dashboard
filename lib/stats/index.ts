/**
 * lib/stats/index.ts
 * 
 * Statistics computation helpers for the compliance dashboard.
 * Provides server-side computation of complex metrics.
 */

import { query } from '@/lib/db';

// ============================================================================
// TYPES
// ============================================================================

export interface ComplianceStats {
  totalCalls: number;
  includedCalls: number;
  excludedCalls: number;
  compliantCalls: number;
  nonCompliantCalls: number;
  compliancePercent: number;
  manualExclusions: number;
  autoExclusions: number;
}

export interface ResponseTimeDistribution {
  avgMinutes: number | null;
  avgFormatted: string;
  medianMinutes: number | null;
  medianFormatted: string;
  p75Minutes: number | null;
  p75Formatted: string;
  p90Minutes: number | null;
  p90Formatted: string;
  p95Minutes: number | null;
  p95Formatted: string;
}

export interface DailyTrend {
  date: string;
  totalCalls: number;
  compliantCalls: number;
  nonCompliantCalls: number;
  compliancePercent: number;
  avgResponseMinutes: number | null;
}

export interface HourlyVolume {
  hour: number;
  callCount: number;
  avgResponseMinutes: number | null;
}

// ============================================================================
// HELPERS
// ============================================================================

export function formatMinutes(mins: number | null): string {
  if (mins === null || isNaN(mins)) return '--:--';
  const totalSeconds = Math.round(mins * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ============================================================================
// COMPUTE COMPLIANCE STATS
// ============================================================================

export async function computeComplianceStats(
  parishFilter: string,
  dateFilter: string,
  params: any[]
): Promise<ComplianceStats> {
  const sql = `
    SELECT
      COUNT(*) as total_calls,
      COUNT(*) FILTER (WHERE is_excluded = false OR is_excluded IS NULL) as included_calls,
      COUNT(*) FILTER (WHERE is_excluded = true) as excluded_calls,
      COUNT(*) FILTER (WHERE is_excluded = true AND is_auto_excluded = false) as manual_exclusions,
      COUNT(*) FILTER (WHERE is_auto_excluded = true) as auto_exclusions,
      COUNT(*) FILTER (
        WHERE (is_excluded = false OR is_excluded IS NULL)
        AND REPLACE(priority, '0', '') IN ('1', '2', '3')
        AND compliance_time_minutes IS NOT NULL
        AND compliance_time_minutes <= COALESCE(threshold_minutes, 12)
      ) as compliant_calls,
      COUNT(*) FILTER (
        WHERE (is_excluded = false OR is_excluded IS NULL)
        AND REPLACE(priority, '0', '') IN ('1', '2', '3')
        AND compliance_time_minutes IS NOT NULL
        AND compliance_time_minutes > COALESCE(threshold_minutes, 12)
      ) as non_compliant_calls
    FROM calls
    WHERE ${parishFilter} ${dateFilter}
  `;
  
  const { rows } = await query(sql, params);
  const r = rows[0];
  
  const included = parseInt(r.included_calls) || 0;
  const compliant = parseInt(r.compliant_calls) || 0;
  const nonCompliant = parseInt(r.non_compliant_calls) || 0;
  const total = compliant + nonCompliant;
  
  return {
    totalCalls: parseInt(r.total_calls) || 0,
    includedCalls: included,
    excludedCalls: parseInt(r.excluded_calls) || 0,
    compliantCalls: compliant,
    nonCompliantCalls: nonCompliant,
    compliancePercent: total > 0 ? Math.round((compliant / total) * 10000) / 100 : 0,
    manualExclusions: parseInt(r.manual_exclusions) || 0,
    autoExclusions: parseInt(r.auto_exclusions) || 0,
  };
}

// ============================================================================
// COMPUTE RESPONSE TIME DISTRIBUTION
// ============================================================================

export async function computeResponseTimeDistribution(
  parishFilter: string,
  dateFilter: string,
  params: any[]
): Promise<ResponseTimeDistribution> {
  const sql = `
    SELECT
      AVG(compliance_time_minutes) as avg_minutes,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY compliance_time_minutes) as p50,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY compliance_time_minutes) as p75,
      PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY compliance_time_minutes) as p90,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY compliance_time_minutes) as p95
    FROM calls
    WHERE ${parishFilter} ${dateFilter}
      AND compliance_time_minutes IS NOT NULL
      AND REPLACE(priority, '0', '') IN ('1', '2', '3')
      AND (is_excluded = false OR is_excluded IS NULL)
  `;
  
  const { rows } = await query(sql, params);
  const r = rows[0];
  
  return {
    avgMinutes: parseFloat(r.avg_minutes) || null,
    avgFormatted: formatMinutes(parseFloat(r.avg_minutes)),
    medianMinutes: parseFloat(r.p50) || null,
    medianFormatted: formatMinutes(parseFloat(r.p50)),
    p75Minutes: parseFloat(r.p75) || null,
    p75Formatted: formatMinutes(parseFloat(r.p75)),
    p90Minutes: parseFloat(r.p90) || null,
    p90Formatted: formatMinutes(parseFloat(r.p90)),
    p95Minutes: parseFloat(r.p95) || null,
    p95Formatted: formatMinutes(parseFloat(r.p95)),
  };
}

// ============================================================================
// COMPUTE DAILY TREND
// ============================================================================

export async function computeDailyTrend(
  parishFilter: string,
  dateFilter: string,
  params: any[]
): Promise<DailyTrend[]> {
  const sql = `
    SELECT
      response_date as date,
      COUNT(*) as total_calls,
      COUNT(*) FILTER (
        WHERE (is_excluded = false OR is_excluded IS NULL)
        AND REPLACE(priority, '0', '') IN ('1', '2', '3')
        AND compliance_time_minutes IS NOT NULL
        AND compliance_time_minutes <= COALESCE(threshold_minutes, 12)
      ) as compliant_calls,
      COUNT(*) FILTER (
        WHERE (is_excluded = false OR is_excluded IS NULL)
        AND REPLACE(priority, '0', '') IN ('1', '2', '3')
        AND compliance_time_minutes IS NOT NULL
        AND compliance_time_minutes > COALESCE(threshold_minutes, 12)
      ) as non_compliant_calls,
      AVG(compliance_time_minutes) FILTER (
        WHERE (is_excluded = false OR is_excluded IS NULL)
        AND REPLACE(priority, '0', '') IN ('1', '2', '3')
        AND compliance_time_minutes IS NOT NULL
      ) as avg_response_minutes
    FROM calls
    WHERE ${parishFilter} ${dateFilter}
      AND response_date IS NOT NULL
    GROUP BY response_date
    ORDER BY response_date
  `;

  const { rows } = await query(sql, params);

  return rows.map(r => {
    const compliant = parseInt(r.compliant_calls) || 0;
    const nonCompliant = parseInt(r.non_compliant_calls) || 0;
    const total = compliant + nonCompliant;
    return {
      date: r.date,
      totalCalls: parseInt(r.total_calls) || 0,
      compliantCalls: compliant,
      nonCompliantCalls: nonCompliant,
      compliancePercent: total > 0 ? Math.round((compliant / total) * 10000) / 100 : 0,
      avgResponseMinutes: parseFloat(r.avg_response_minutes) || null,
    };
  });
}

// ============================================================================
// COMPUTE HOURLY VOLUME (PEAK LOAD)
// ============================================================================

export async function computeHourlyVolume(
  parishFilter: string,
  dateFilter: string,
  params: any[]
): Promise<HourlyVolume[]> {
  // Note: call_in_que_time format is 'MM/DD/YY HH24:MI:SS'
  const sql = `
    SELECT
      EXTRACT(HOUR FROM TO_TIMESTAMP(call_in_que_time, 'MM/DD/YY HH24:MI:SS')) as hour,
      COUNT(*) as call_count,
      AVG(compliance_time_minutes) FILTER (
        WHERE (is_excluded = false OR is_excluded IS NULL)
        AND REPLACE(priority, '0', '') IN ('1', '2', '3')
        AND compliance_time_minutes IS NOT NULL
      ) as avg_response_minutes
    FROM calls
    WHERE ${parishFilter} ${dateFilter}
      AND call_in_que_time IS NOT NULL
    GROUP BY EXTRACT(HOUR FROM TO_TIMESTAMP(call_in_que_time, 'MM/DD/YY HH24:MI:SS'))
    ORDER BY hour
  `;

  const { rows } = await query(sql, params);

  // Fill in missing hours with 0
  const hourlyMap = new Map<number, HourlyVolume>();
  for (let h = 0; h < 24; h++) {
    hourlyMap.set(h, { hour: h, callCount: 0, avgResponseMinutes: null });
  }

  for (const r of rows) {
    const hour = parseInt(r.hour);
    if (!isNaN(hour)) {
      hourlyMap.set(hour, {
        hour,
        callCount: parseInt(r.call_count) || 0,
        avgResponseMinutes: parseFloat(r.avg_response_minutes) || null,
      });
    }
  }

  return Array.from(hourlyMap.values()).sort((a, b) => a.hour - b.hour);
}

