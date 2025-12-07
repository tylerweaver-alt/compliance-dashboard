// app/api/calls/report-data/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Helper: parse "0:08:22" / "08:22" / "300" → seconds
function parseDurationToSeconds(input: string | null | undefined): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':').map((p) => p.trim());
  if (parts.some((p) => p === '' || isNaN(Number(p)))) return null;

  let seconds = 0;

  if (parts.length === 3) {
    const [h, m, s] = parts.map(Number);
    seconds = h * 3600 + m * 60 + s;
  } else if (parts.length === 2) {
    const [m, s] = parts.map(Number);
    seconds = m * 60 + s;
  } else if (parts.length === 1) {
    seconds = Number(parts[0]);
  } else {
    return null;
  }

  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return seconds;
}

// Parse "MM/DD/YYYY" → Date
function parseResponseDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const [mm, dd, yyyy] = trimmed.split('/');
  if (!mm || !dd || !yyyy) return null;
  const m = Number(mm);
  const d = Number(dd);
  const y = Number(yyyy);
  if (!m || !d || !y) return null;

  const dt = new Date(y, m - 1, d); // months 0-based
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

// Format Date → "Nov 01, 2025"
function formatDateForLabel(dt: Date): string {
  const month = dt.toLocaleString('en-US', { month: 'short' });
  const day = dt.toLocaleString('en-US', { day: '2-digit' });
  const year = dt.getFullYear();
  return `${month} ${day}, ${year}`;
}

// Normalize zone name for fuzzy matching (handles "5mi" vs "5min" etc)
function normalizeZoneName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/(\d+)\s*mi\b/gi, '$1min')
    .replace(/(\d+)\s*min\b/gi, '$1min');
}

type Call = {
  date: string;
  time: string;
  unit: string;
  responseArea: string;
  locationLabel: string;
  address: string;
  callInQueueTime: string;
  unitAssignedTime: string;
  enrouteTime: string;
  onSceneTime: string;
  departSceneTime: string;
  arrivedDestinationTime: string;
  queueResponseTime: string;  // The compliance-relevant response time
  compliance: boolean | null;
  isExcluded: boolean;
};

export async function GET(req: NextRequest) {
  const client = await pool.connect();

  try {
    const { searchParams } = new URL(req.url);
    const parishStr = searchParams.get('parish'); // ?parish=<parish_id>
    const startParam = searchParams.get('start'); // optional YYYY-MM-DD
    const endParam = searchParams.get('end');     // optional YYYY-MM-DD

    if (!parishStr) {
      return NextResponse.json(
        { error: 'parish is required (parish_id)' },
        { status: 400 }
      );
    }

    const parishId = parseInt(parishStr, 10);
    if (Number.isNaN(parishId)) {
      return NextResponse.json(
        { error: 'parish must be a valid integer parish_id' },
        { status: 400 }
      );
    }

    // 1) Get parish name + settings
    const parishRes = await client.query<{
      id: number;
      name: string;
      global_response_threshold_seconds: number | null;
      target_average_response_seconds: number | null;
      use_zones: boolean;
    }>(
      `
      select
        p.id,
        p.name,
        s.global_response_threshold_seconds,
        s.target_average_response_seconds,
        coalesce(s.use_zones, false) as use_zones
      from parishes p
      left join parish_settings s
        on s.parish_id = p.id::text
      where p.id = $1
      `,
      [parishId]
    );

    if (parishRes.rowCount === 0) {
      return NextResponse.json(
        { error: `No parish found with id ${parishId}` },
        { status: 404 }
      );
    }

    const parishRow = parishRes.rows[0];
    const parishName = parishRow.name;
    const parishThresholdSeconds = parishRow.global_response_threshold_seconds; // Parish-level fallback
    const targetAvgSeconds = parishRow.target_average_response_seconds;   // Option B (future)
    const useZones = parishRow.use_zones; // reserved for later

    // 1b) Get zone-specific thresholds from response_area_mappings
    const zoneThresholdsRes = await client.query<{
      response_area: string;
      threshold_minutes: number | null;
    }>(
      `SELECT response_area, threshold_minutes FROM response_area_mappings WHERE parish_id = $1`,
      [parishId]
    );

    // Build zone threshold lookup (zone name -> threshold in seconds)
    const zoneThresholds: Record<string, number> = {};
    const normalizedZoneThresholds: Record<string, number> = {};

    for (const row of zoneThresholdsRes.rows) {
      if (row.threshold_minutes != null) {
        const thresholdSecs = row.threshold_minutes * 60;
        zoneThresholds[row.response_area] = thresholdSecs;
        // Also store normalized version for fuzzy matching
        const normalized = normalizeZoneName(row.response_area);
        normalizedZoneThresholds[normalized] = thresholdSecs;
      }
    }

    // Helper to get threshold for a zone (zone-specific first, then parish fallback)
    function getThresholdForZone(zoneName: string): number | null {
      // Try exact match first
      if (zoneThresholds[zoneName] !== undefined) {
        return zoneThresholds[zoneName];
      }
      // Try normalized match (handles "5mi" vs "5min" etc)
      const normalized = normalizeZoneName(zoneName);
      if (normalizedZoneThresholds[normalized] !== undefined) {
        return normalizedZoneThresholds[normalized];
      }
      // Fall back to parish-level threshold
      return parishThresholdSeconds;
    }

    // 2) Decide effective start/end
    let effectiveStart: string | null = startParam;
    let effectiveEnd: string | null = endParam;

    // If caller did NOT pass start/end, pick the latest month that has data
    if (!startParam && !endParam) {
      type AggRow = { max_date: string | null; month_start: string | null };

      const aggRes = await client.query<AggRow>(
        `
        with d as (
          select to_date(response_date, 'MM/DD/YYYY') as d
          from calls
          where parish_id = $1
        )
        select
          max(d) as max_date,
          date_trunc('month', max(d))::date as month_start
        from d
        `,
        [parishId]
      );

      const aggRow = aggRes.rows[0];

      if (aggRow && aggRow.max_date && aggRow.month_start) {
        // Postgres sends dates as "YYYY-MM-DD"
        effectiveEnd = aggRow.max_date;      // e.g. 2025-11-25
        effectiveStart = aggRow.month_start; // e.g. 2025-11-01
      }
      // If no calls yet, both stay null and we just don't filter by date.
    }

    // 3) Build WHERE for calls
    const whereClauses: string[] = ['parish_id = $1'];
    const params: any[] = [parishId];
    let idx = 2;

    if (effectiveStart) {
      whereClauses.push(
        `to_date(response_date, 'MM/DD/YYYY') >= $${idx++}`
      );
      params.push(effectiveStart);
    }

    if (effectiveEnd) {
      whereClauses.push(
        `to_date(response_date, 'MM/DD/YYYY') <= $${idx++}`
      );
      params.push(effectiveEnd);
    }

    const whereSql = whereClauses.join(' and ');

    // 4) Fetch calls for this parish & date range
    const callsRes = await client.query(
      `
      select
        id,

        -- core identifiers / fields
        response_date,
        response_date_time,
        radio_name,
        response_area,

        origin_address,
        origin_location_city,

        call_in_que_time,
        assigned_time_first_unit,
        assigned_time,
        enroute_time,
        arrived_at_scene_time,
        depart_scene_time,
        arrived_destination_time,

        queue_response_time,
        assigned_to_arrived_at_scene,
        call_in_queue_to_cleared_call_lag,

        -- exclusion fields
        is_excluded,
        exclusion_reason,
        is_auto_excluded,
        auto_exclusion_reason,
        auto_exclusion_strategy,
        is_any_excluded,
        is_weather_excluded,

        -- compliance field (computed from response time vs threshold)
        is_out_of_compliance,
        response_time_minutes,
        applicable_threshold_minutes
      from calls_with_exclusions
      where ${whereSql}
      order by
        to_date(response_date, 'MM/DD/YYYY') desc nulls last,
        id desc
      `,
      params
    );

    const rows = callsRes.rows;

    const calls: Call[] = [];

    let compliantCount = 0;
    let totalWithThreshold = 0;
    let sumResponseSeconds = 0;
    let countResponseSeconds = 0;

    // Track actual span of dates in result set
    let minDate: Date | null = null;
    let maxDate: Date | null = null;

    for (const r of rows) {
      // Date span tracking
      const dateObj = parseResponseDate(r.response_date);
      if (dateObj) {
        if (!minDate || dateObj < minDate) minDate = dateObj;
        if (!maxDate || dateObj > maxDate) maxDate = dateObj;
      }

      // Core fields
      const date = r.response_date ?? '';
      const time = r.response_date_time ?? '';
      const unit = r.radio_name ?? '';
      const responseArea = r.response_area ?? '';
      const locationLabel = r.origin_location_city ?? '';
      const address = r.origin_address ?? '';

      // Time stamps
      const callInQueueTime = r.call_in_que_time ?? '';
      const unitAssignedTime = r.assigned_time_first_unit ?? r.assigned_time ?? '';
      const enrouteTime = r.enroute_time ?? '';
      const onSceneTime = r.arrived_at_scene_time ?? '';
      const departSceneTime = r.depart_scene_time ?? '';
      const arrivedDestinationTime = r.arrived_destination_time ?? '';

      // Queue Response Time - used for compliance calculation
      // Formula: On Scene Time - Call in Queue Time = Response Time
      const queueResponseTime = r.queue_response_time ?? '';
      const responseSeconds = parseDurationToSeconds(queueResponseTime);
      if (responseSeconds !== null) {
        sumResponseSeconds += responseSeconds;
        countResponseSeconds += 1;
      }

      // Compliance vs zone-specific threshold (or parish fallback)
      // Threshold of X minutes means X:59 (add 59 seconds for compliance)
      let compliance: boolean | null = null;
      const zoneThresholdSecs = getThresholdForZone(responseArea);
      if (zoneThresholdSecs != null && responseSeconds != null) {
        const thresholdWithSeconds = zoneThresholdSecs + 59; // X:59
        compliance = responseSeconds <= thresholdWithSeconds;
        totalWithThreshold += 1;
        if (compliance) compliantCount += 1;
      }

      // Excluded flag
      const isExcluded: boolean = Boolean(r.is_excluded);

      calls.push({
        date,
        time,
        unit,
        responseArea,
        locationLabel,
        address,
        callInQueueTime,
        unitAssignedTime,
        enrouteTime,
        onSceneTime,
        departSceneTime,
        arrivedDestinationTime,
        queueResponseTime,
        compliance,
        isExcluded,
      });
    }

    const totalCalls = calls.length;
    const completeCalls = totalCalls;
    const missingForms = 0;
    const cancelledCalls = 0;
    const missingPCS = 0;
    const missingCPR = 0;
    const missingSignature = 0;

    // Compliance %
    let complianceRate = 0;
    if (totalWithThreshold > 0) {
      complianceRate = Math.round((compliantCount / totalWithThreshold) * 100);
    }

    // Average response time (seconds + display)
    let avgResponseSeconds: number | null = null;
    let avgResponse = '';

    if (countResponseSeconds > 0) {
      avgResponseSeconds = Math.round(sumResponseSeconds / countResponseSeconds);
      const mm = Math.floor(avgResponseSeconds / 60);
      const ss = avgResponseSeconds % 60;
      avgResponse = `${mm}:${ss.toString().padStart(2, '0')}`;
    }

    const avgScene = '';
    const avgTransport = '';

    // Build reportPeriod from actual min/max dates
    let reportPeriod: string;
    if (minDate && maxDate) {
      const startLabel = formatDateForLabel(minDate);
      const endLabel = formatDateForLabel(maxDate);
      reportPeriod =
        startLabel === endLabel ? startLabel : `${startLabel} to ${endLabel}`;
    } else {
      reportPeriod = 'No calls in selected range';
    }

    const payload = {
      parishName,
      reportPeriod,
      totalCalls,
      completeCalls,
      missingForms,
      cancelledCalls,
      missingPCS,
      missingCPR,
      missingSignature,
      avgResponse,
      avgScene,
      avgTransport,
      complianceRate,
      calls,
    };

    return NextResponse.json(payload);
  } catch (err: any) {
    console.error('Error in /api/calls/report-data:', err);
    return NextResponse.json(
      {
        error: 'Failed to build report data',
        details: err.message ?? String(err),
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}