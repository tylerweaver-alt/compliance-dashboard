const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// View for React/dashboard queries - joins calls with weather audit info
const sqlCallWeatherExclusionsView = `
CREATE OR REPLACE VIEW call_weather_exclusions_view AS
SELECT
  c.id                         AS call_id,
  c.parish_id,
  c.response_number,
  c.response_date_time,
  c.origin_description,
  c.origin_address,
  c.origin_location_city,
  c.origin_zip,
  c.problem_description,
  c.priority,

  c.is_excluded,
  c.exclusion_reason,
  c.is_auto_excluded,
  c.auto_exclusion_strategy,
  c.auto_exclusion_reason,
  c.auto_excluded_at,
  c.auto_exclusion_metadata,

  a.weather_event_id,
  a.weather_event_type,
  a.weather_severity,
  a.weather_area_desc,
  a.overlap_start,
  a.overlap_end,
  a.created_at               AS audit_created_at,
  a.extra                    AS audit_extra
FROM calls c
JOIN call_weather_exclusion_audit a
  ON a.call_id = c.id;
`;

// View that computes is_out_of_compliance for each call
// Logic matches the UI: response_time > threshold + 59/60 (i.e., X:59 is still compliant)
const sqlCallsWithComplianceView = `
DROP VIEW IF EXISTS calls_with_compliance CASCADE;
CREATE VIEW calls_with_compliance AS
WITH thresholds AS (
  -- Zone-specific thresholds from response_area_mappings
  SELECT response_area, threshold_minutes, parish_id
  FROM response_area_mappings
  WHERE threshold_minutes IS NOT NULL
),
parish_thresholds AS (
  -- Parish-level fallback thresholds
  SELECT parish_id::integer as parish_id, global_response_threshold_seconds / 60.0 as threshold_minutes
  FROM parish_settings
  WHERE global_response_threshold_seconds IS NOT NULL
)
SELECT
  c.*,
  -- Calculate response time in minutes: (arrived_at_scene_time - call_in_que_time)
  CASE
    WHEN c.arrived_at_scene_time IS NOT NULL AND c.call_in_que_time IS NOT NULL THEN
      EXTRACT(EPOCH FROM (
        safe_timestamptz(c.arrived_at_scene_time) - safe_timestamptz(c.call_in_que_time)
      )) / 60.0
    ELSE NULL
  END AS response_time_minutes,

  -- Get the applicable threshold: zone-specific > parish fallback > 10 min default
  COALESCE(
    zt.threshold_minutes,
    pt.threshold_minutes,
    10.0
  ) AS applicable_threshold_minutes,

  -- Is the call out of compliance?
  -- response_time > threshold + 59/60 (so X:59 is still compliant)
  CASE
    WHEN c.arrived_at_scene_time IS NOT NULL AND c.call_in_que_time IS NOT NULL THEN
      (EXTRACT(EPOCH FROM (
        safe_timestamptz(c.arrived_at_scene_time) - safe_timestamptz(c.call_in_que_time)
      )) / 60.0) > (COALESCE(zt.threshold_minutes, pt.threshold_minutes, 10.0) + 59.0/60.0)
    ELSE NULL  -- Unknown compliance if times missing
  END AS is_out_of_compliance
FROM calls c
LEFT JOIN thresholds zt ON zt.response_area = c.response_area AND zt.parish_id = c.parish_id
LEFT JOIN parish_thresholds pt ON pt.parish_id = c.parish_id;
`;

// Main view for dashboard - adds is_any_excluded and is_weather_excluded flags
const sqlCallsWithExclusionsView = `
DROP VIEW IF EXISTS calls_with_exclusions CASCADE;
CREATE VIEW calls_with_exclusions AS
SELECT
  cc.*,
  -- Combined exclusion flag: either manual or auto-excluded
  COALESCE(cc.is_excluded, FALSE) OR COALESCE(cc.is_auto_excluded, FALSE) AS is_any_excluded,
  -- Weather-specific exclusion flag
  COALESCE(cc.is_auto_excluded, FALSE) AND cc.auto_exclusion_strategy = 'NWS_WEATHER_ALERT' AS is_weather_excluded
FROM calls_with_compliance cc;
`;

// Create the audit table if it doesn't exist
const sqlCreateAuditTable = `
CREATE TABLE IF NOT EXISTS call_weather_exclusion_audit (
  id BIGSERIAL PRIMARY KEY,
  call_id BIGINT NOT NULL,
  weather_event_id BIGINT NOT NULL,
  exclusion_strategy TEXT NOT NULL,
  exclusion_reason TEXT,
  overlap_start TIMESTAMPTZ,
  overlap_end TIMESTAMPTZ,
  weather_event_type TEXT,
  weather_severity TEXT,
  weather_area_desc TEXT,
  extra JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(call_id, weather_event_id, exclusion_strategy)
);
`;

// Auto-exclusion function SQL
// IMPORTANT: Only auto-excludes calls that are OUT OF COMPLIANCE (red calls)
// Calls that are in compliance (green) will NOT be auto-excluded, even if they overlap weather alerts
const sqlAutoExclusionFunction = `
CREATE OR REPLACE FUNCTION apply_weather_auto_exclusions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows INTEGER := 0;
BEGIN
  -- 1) Find calls that match weather alerts, are not yet auto-excluded, AND are out of compliance
  -- CRITICAL: Only out-of-compliance (red) calls can be weather auto-excluded
  WITH candidates AS (
    SELECT
      cwm.call_id,
      cwm.weather_event_id,
      cwm.weather_event_type,
      cwm.weather_severity,
      cwm.weather_area_desc,
      cwm.overlap_start,
      cwm.overlap_end
    FROM call_weather_matches cwm
    JOIN calls c ON c.id = cwm.call_id
    WHERE COALESCE(c.is_auto_excluded, FALSE) = FALSE
      -- ONLY exclude calls that are OUT OF COMPLIANCE (red calls)
      AND cwm.is_out_of_compliance = TRUE
  ),

  -- 2) Insert audit rows (idempotent via UNIQUE index + ON CONFLICT)
  inserted AS (
    INSERT INTO call_weather_exclusion_audit (
      call_id,
      weather_event_id,
      exclusion_strategy,
      exclusion_reason,
      overlap_start,
      overlap_end,
      weather_event_type,
      weather_severity,
      weather_area_desc,
      extra
    )
    SELECT
      call_id,
      weather_event_id,
      'NWS_WEATHER_ALERT' AS exclusion_strategy,
      'Out-of-compliance call excluded due to NWS weather alert active during response' AS exclusion_reason,
      overlap_start,
      overlap_end,
      weather_event_type,
      weather_severity,
      weather_area_desc,
      jsonb_build_object(
        'weather_event_id', weather_event_id,
        'weather_event_type', weather_event_type,
        'weather_severity', weather_severity,
        'weather_area_desc', weather_area_desc,
        'overlap_start', overlap_start,
        'overlap_end', overlap_end
      )
    FROM candidates
    ON CONFLICT (call_id, weather_event_id, exclusion_strategy) DO NOTHING
    RETURNING call_id
  )

  -- 3) Update calls table to mark those calls as auto-excluded
  UPDATE calls c
  SET
    is_auto_excluded        = TRUE,
    auto_exclusion_strategy = 'NWS_WEATHER_ALERT',
    auto_exclusion_reason   = 'Out-of-compliance call excluded due to NWS weather alert active during response',
    auto_excluded_at        = now(),
    auto_exclusion_metadata =
      COALESCE(c.auto_exclusion_metadata, '{}'::jsonb)
      || jsonb_build_object(
           'weather_exclusion', jsonb_build_object(
             'strategy', 'NWS_WEATHER_ALERT',
             'last_applied_at', now(),
             'reason', 'Only out-of-compliance calls are eligible for weather auto-exclusion'
           )
         )
  WHERE c.id IN (SELECT call_id FROM inserted);

  -- how many calls were updated this run
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN v_rows;
END;
$$;
`;

// First, create a helper function to safely parse timestamps
const sqlCreateFunction = `
CREATE OR REPLACE FUNCTION safe_timestamptz(text) RETURNS timestamptz AS $$
BEGIN
  RETURN $1::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
`;

// Updated to use weather_events table and includes is_out_of_compliance flag
// The view now joins with calls_with_compliance to get the compliance status
const sql = `DROP VIEW IF EXISTS call_weather_matches CASCADE;
CREATE VIEW call_weather_matches AS
WITH thresholds AS (
  -- Zone-specific thresholds from response_area_mappings
  SELECT response_area, threshold_minutes, parish_id
  FROM response_area_mappings
  WHERE threshold_minutes IS NOT NULL
),
parish_thresholds AS (
  -- Parish-level fallback thresholds
  SELECT parish_id::integer as parish_id, global_response_threshold_seconds / 60.0 as threshold_minutes
  FROM parish_settings
  WHERE global_response_threshold_seconds IS NOT NULL
),
base_calls AS (
  SELECT
    cw.*,
    -- Calculate response time in minutes: (arrived_at_scene_time - call_in_que_time)
    CASE
      WHEN cw.arrived_at_scene_time IS NOT NULL AND cw.call_in_que_time IS NOT NULL THEN
        EXTRACT(EPOCH FROM (
          safe_timestamptz(cw.arrived_at_scene_time) - safe_timestamptz(cw.call_in_que_time)
        )) / 60.0
      ELSE NULL
    END AS response_time_minutes,
    -- Get the applicable threshold: zone-specific > parish fallback > 10 min default
    COALESCE(
      zt.threshold_minutes,
      pt.threshold_minutes,
      10.0
    ) AS applicable_threshold_minutes
  FROM calls_with_times cw
  LEFT JOIN thresholds zt ON zt.response_area = cw.response_area AND zt.parish_id = cw.parish_id
  LEFT JOIN parish_thresholds pt ON pt.parish_id = cw.parish_id
  WHERE COALESCE(cw.is_auto_excluded, FALSE) = FALSE
    AND safe_timestamptz(cw.call_start_time) IS NOT NULL
    AND safe_timestamptz(cw.call_end_time) IS NOT NULL
)
SELECT
  bc.id              AS call_id,
  bc.parish_id,
  bc.response_number,
  bc.call_start_time,
  bc.call_end_time,
  bc.response_time_minutes,
  bc.applicable_threshold_minutes,
  -- Is the call out of compliance? (response_time > threshold + 59/60)
  -- Only TRUE for red calls that exceeded their threshold
  CASE
    WHEN bc.response_time_minutes IS NOT NULL THEN
      bc.response_time_minutes > (bc.applicable_threshold_minutes + 59.0/60.0)
    ELSE NULL  -- Unknown compliance if times missing
  END AS is_out_of_compliance,
  w.id               AS weather_event_id,
  w.starts_at        AS alert_start,
  w.ends_at          AS alert_end,
  w.event            AS weather_event_type,
  w.severity         AS weather_severity,
  w.area_desc        AS weather_area_desc,
  ST_AsText(bc.geom) AS call_point_wkt,
  w.geojson::text    AS alert_polygon_geojson,
  GREATEST(
    safe_timestamptz(bc.call_start_time),
    w.starts_at
  ) AS overlap_start,
  LEAST(
    safe_timestamptz(bc.call_end_time),
    w.ends_at
  ) AS overlap_end
FROM base_calls bc
JOIN weather_events w
  ON safe_timestamptz(bc.call_start_time) <= w.ends_at
 AND safe_timestamptz(bc.call_end_time)   >= w.starts_at
 AND w.geojson IS NOT NULL
 AND ST_Intersects(
       ST_SetSRID(bc.geom, 4326),
       ST_SetSRID(ST_GeomFromGeoJSON(w.geojson::text), 4326)
     )`;

async function run() {
  try {
    console.log('=== Weather Auto-Exclusion Setup (Compliance-Aware) ===\n');
    console.log('IMPORTANT: Only OUT-OF-COMPLIANCE (red) calls will be auto-excluded.\n');
    console.log('Calls that are IN COMPLIANCE (green) will NOT be auto-excluded,');
    console.log('even if they overlap a weather alert.\n');

    // Create weather_events table if it doesn't exist (for NWS alerts script)
    console.log('--- Creating weather_events table (if not exists) ---');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS weather_events (
        id BIGSERIAL PRIMARY KEY,
        event TEXT,
        severity TEXT,
        area_desc TEXT,
        starts_at TIMESTAMPTZ,
        ends_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT now(),
        geojson JSONB
      )
    `);
    console.log('weather_events table ready.');

    console.log('\n--- Creating safe_timestamptz function ---');
    await pool.query(sqlCreateFunction);
    console.log('Function created.');

    // Create the audit table
    console.log('\n--- Creating call_weather_exclusion_audit table ---');
    await pool.query(sqlCreateAuditTable);
    console.log('Audit table ready.');

    // Create calls_with_compliance view FIRST (dependency for calls_with_exclusions)
    console.log('\n--- Creating calls_with_compliance view ---');
    await pool.query(sqlCallsWithComplianceView);
    console.log('calls_with_compliance view ready.');

    // Verify is_out_of_compliance column
    console.log('\n--- Verifying is_out_of_compliance calculation ---');
    const complianceCheck = await pool.query(`
      SELECT
        id,
        response_number,
        response_area,
        response_time_minutes,
        applicable_threshold_minutes,
        is_out_of_compliance,
        CASE
          WHEN is_out_of_compliance = TRUE THEN 'RED (out of compliance)'
          WHEN is_out_of_compliance = FALSE THEN 'GREEN (in compliance)'
          ELSE 'UNKNOWN (missing times)'
        END as compliance_status
      FROM calls_with_compliance
      WHERE response_time_minutes IS NOT NULL
      ORDER BY response_time_minutes DESC
      LIMIT 10
    `);
    console.log('Sample calls with compliance status:');
    complianceCheck.rows.forEach(r => {
      const mins = parseFloat(r.response_time_minutes).toFixed(2);
      const thresh = parseFloat(r.applicable_threshold_minutes).toFixed(2);
      console.log(`  ${r.response_number}: ${mins} min vs ${thresh} min threshold => ${r.compliance_status}`);
    });

    // Create the calls_with_exclusions view (depends on calls_with_compliance)
    console.log('\n--- Creating calls_with_exclusions view ---');
    await pool.query(sqlCallsWithExclusionsView);
    console.log('calls_with_exclusions view ready.');

    // Create the call_weather_matches view with is_out_of_compliance
    console.log('\n--- Creating call_weather_matches view (with compliance flag) ---');
    await pool.query(sql);
    console.log('call_weather_matches view ready.');

    // Check weather matches with compliance info
    console.log('\n--- Checking call_weather_matches with compliance info ---');
    const weatherMatches = await pool.query(`
      SELECT
        call_id,
        response_number,
        response_time_minutes,
        applicable_threshold_minutes,
        is_out_of_compliance,
        weather_event_type,
        weather_severity,
        CASE
          WHEN is_out_of_compliance = TRUE THEN 'WILL BE EXCLUDED'
          WHEN is_out_of_compliance = FALSE THEN 'WILL NOT BE EXCLUDED (in compliance)'
          ELSE 'WILL NOT BE EXCLUDED (unknown compliance)'
        END as exclusion_decision
      FROM call_weather_matches
      LIMIT 20
    `);
    console.log(`Found ${weatherMatches.rows.length} weather-overlapping calls`);
    weatherMatches.rows.forEach(r => {
      const mins = r.response_time_minutes ? parseFloat(r.response_time_minutes).toFixed(2) : 'N/A';
      console.log(`  Call ${r.call_id} (${r.response_number}): ${mins} min, ${r.weather_event_type} => ${r.exclusion_decision}`);
    });

    // Create the dashboard view
    console.log('\n--- Creating call_weather_exclusions_view ---');
    await pool.query(sqlCallWeatherExclusionsView);
    console.log('Dashboard view ready.');

    // Create the auto-exclusion function (ONLY excludes out-of-compliance calls)
    console.log('\n--- Creating apply_weather_auto_exclusions function ---');
    await pool.query(sqlAutoExclusionFunction);
    console.log('Function created (ONLY excludes out-of-compliance calls).');

    // Run the function
    console.log('\n--- Running apply_weather_auto_exclusions() ---');
    const result = await pool.query('SELECT apply_weather_auto_exclusions() as rows_updated');
    console.log(`Rows auto-excluded: ${result.rows[0].rows_updated}`);

    // Check excluded calls
    console.log('\n--- Auto-excluded calls (NWS_WEATHER_ALERT) ---');
    const excludedCalls = await pool.query(`
      SELECT id, response_number, is_auto_excluded, auto_exclusion_strategy, auto_exclusion_reason
      FROM calls
      WHERE is_auto_excluded = TRUE AND auto_exclusion_strategy = 'NWS_WEATHER_ALERT'
      LIMIT 10
    `);
    console.log(`Found ${excludedCalls.rows.length} auto-excluded calls`);
    excludedCalls.rows.forEach(c => console.log(`  Call ${c.id} (${c.response_number}): ${c.auto_exclusion_reason}`));

    // Summary
    console.log('\n=== SUMMARY ===');
    const stats = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE is_out_of_compliance = TRUE) as out_of_compliance,
        COUNT(*) FILTER (WHERE is_out_of_compliance = FALSE) as in_compliance,
        COUNT(*) FILTER (WHERE is_out_of_compliance IS NULL) as unknown
      FROM call_weather_matches
    `);
    const s = stats.rows[0];
    console.log(`Weather-overlapping calls breakdown:`);
    console.log(`  - Out of compliance (eligible for exclusion): ${s.out_of_compliance}`);
    console.log(`  - In compliance (protected from exclusion): ${s.in_compliance}`);
    console.log(`  - Unknown compliance: ${s.unknown}`);

    console.log('\n✅ Setup complete!');
    console.log('Weather auto-exclusions will now ONLY apply to out-of-compliance (red) calls.');

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();

