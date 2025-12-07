// app/api/parish-settings/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const runtime = 'nodejs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Default report columns: Date, Call#, Unit, Address, Received, Dispatched, Enroute, Staged, On Scene, Depart, Arrived, Available, Response, Status
const DEFAULT_REPORT_COLUMNS = [
  'date', 'call_number', 'unit', 'address', 'received', 'dispatched',
  'enroute', 'staged', 'on_scene', 'depart', 'arrived',
  'available', 'response', 'status'
];

// Shape we return to the frontend
function mapRowToSettings(row: any) {
  return {
    parishId: row.parish_id,
    globalResponseThresholdSeconds: row.global_response_threshold_seconds,
    targetAverageResponseSeconds: row.target_average_response_seconds,
    useZones: row.use_zones ?? false,
    exceptionKeywords: row.exception_keywords ?? [],
    reportColumns: row.report_columns ?? DEFAULT_REPORT_COLUMNS,
    responseStartTime: row.response_start_time ?? 'dispatched',
    targetCompliancePercent: row.target_compliance_percent ?? 90.0,
  };
}

// GET /api/parish-settings?parish_id=1
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const parishStr = searchParams.get('parish_id');

  if (!parishStr) {
    return NextResponse.json(
      { error: 'parish_id is required' },
      { status: 400 }
    );
  }

  const parishId = parseInt(parishStr, 10);
  if (Number.isNaN(parishId)) {
    return NextResponse.json(
      { error: 'parish_id must be a valid integer' },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    // Make sure parish exists (optional but nice)
    const parishRes = await client.query(
      `select id, name from parishes where id = $1`,
      [parishId]
    );
    if (parishRes.rowCount === 0) {
      return NextResponse.json(
        { error: `No parish found with id ${parishId}` },
        { status: 404 }
      );
    }

    const settingsRes = await client.query(
      `
      select
        parish_id,
        global_response_threshold_seconds,
        target_average_response_seconds,
        coalesce(use_zones, false) as use_zones,
        coalesce(exception_keywords, '{}'::text[]) as exception_keywords,
        report_columns,
        response_start_time,
        coalesce(target_compliance_percent, 90.0) as target_compliance_percent
      from parish_settings
      where parish_id = $1
      `,
      [parishId]
    );

    if (settingsRes.rowCount === 0) {
      // Return defaults if no row yet
      return NextResponse.json({
        parishId,
        globalResponseThresholdSeconds: null,
        targetAverageResponseSeconds: null,
        useZones: false,
        exceptionKeywords: [],
        reportColumns: DEFAULT_REPORT_COLUMNS,
        responseStartTime: 'dispatched',
        targetCompliancePercent: 90.0,
      });
    }

    return NextResponse.json(mapRowToSettings(settingsRes.rows[0]));
  } catch (err: any) {
    console.error('GET /api/parish-settings error:', err);
    return NextResponse.json(
      {
        error: 'Failed to load parish settings',
        details: err.message ?? String(err),
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// PUT /api/parish-settings
// Body: { parishId, globalResponseThresholdSeconds, targetAverageResponseSeconds, useZones, exceptionKeywords }
export async function PUT(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const {
    parishId,
    globalResponseThresholdSeconds,
    targetAverageResponseSeconds,
    useZones,
    exceptionKeywords,
    reportColumns,
    responseStartTime,
    targetCompliancePercent,
  } = body ?? {};

  if (!parishId || Number.isNaN(Number(parishId))) {
    return NextResponse.json(
      { error: 'parishId is required and must be a valid integer' },
      { status: 400 }
    );
  }

  const parishIdInt = Number(parishId);

  const thresholdSeconds =
    globalResponseThresholdSeconds === null ||
    globalResponseThresholdSeconds === undefined ||
    globalResponseThresholdSeconds === ''
      ? null
      : Number(globalResponseThresholdSeconds);

  const targetAvgSeconds =
    targetAverageResponseSeconds === null ||
    targetAverageResponseSeconds === undefined ||
    targetAverageResponseSeconds === ''
      ? null
      : Number(targetAverageResponseSeconds);

  if (
    thresholdSeconds !== null &&
    (Number.isNaN(thresholdSeconds) || thresholdSeconds < 0)
  ) {
    return NextResponse.json(
      { error: 'globalResponseThresholdSeconds must be a non-negative number or null' },
      { status: 400 }
    );
  }

  if (
    targetAvgSeconds !== null &&
    (Number.isNaN(targetAvgSeconds) || targetAvgSeconds < 0)
  ) {
    return NextResponse.json(
      { error: 'targetAverageResponseSeconds must be a non-negative number or null' },
      { status: 400 }
    );
  }

  const useZonesBool = !!useZones;
  const exceptionArray: string[] = Array.isArray(exceptionKeywords)
    ? exceptionKeywords.map((x) => String(x).trim()).filter((x) => x.length > 0)
    : [];

  // Report columns - validate and clean
  const reportColumnsArray: string[] = Array.isArray(reportColumns)
    ? reportColumns.map((x) => String(x).trim()).filter((x) => x.length > 0)
    : DEFAULT_REPORT_COLUMNS;

  // Response start time - validate
  const validStartTimes = ['dispatched', 'received', 'enroute'];
  const responseStartTimeVal = validStartTimes.includes(responseStartTime)
    ? responseStartTime
    : 'dispatched';

  // Target compliance percent - validate (0-100)
  const targetComplianceVal =
    targetCompliancePercent === null ||
    targetCompliancePercent === undefined ||
    targetCompliancePercent === ''
      ? 90.0 // Default to 90%
      : Number(targetCompliancePercent);

  if (isNaN(targetComplianceVal) || targetComplianceVal < 0 || targetComplianceVal > 100) {
    return NextResponse.json(
      { error: 'targetCompliancePercent must be a number between 0 and 100' },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    const upsertRes = await client.query(
      `
      insert into parish_settings (
        parish_id,
        global_response_threshold_seconds,
        target_average_response_seconds,
        use_zones,
        exception_keywords,
        report_columns,
        response_start_time,
        target_compliance_percent
      ) values ($1, $2, $3, $4, $5, $6, $7, $8)
      on conflict (parish_id)
      do update set
        global_response_threshold_seconds = excluded.global_response_threshold_seconds,
        target_average_response_seconds = excluded.target_average_response_seconds,
        use_zones = excluded.use_zones,
        exception_keywords = excluded.exception_keywords,
        report_columns = excluded.report_columns,
        response_start_time = excluded.response_start_time,
        target_compliance_percent = excluded.target_compliance_percent
      returning
        parish_id,
        global_response_threshold_seconds,
        target_average_response_seconds,
        use_zones,
        exception_keywords,
        report_columns,
        response_start_time,
        target_compliance_percent
      `,
      [parishIdInt, thresholdSeconds, targetAvgSeconds, useZonesBool, exceptionArray, reportColumnsArray, responseStartTimeVal, targetComplianceVal]
    );

    return NextResponse.json(mapRowToSettings(upsertRes.rows[0]));
  } catch (err: any) {
    console.error('PUT /api/parish-settings error:', err);
    return NextResponse.json(
      {
        error: 'Failed to save parish settings',
        details: err.message ?? String(err),
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
