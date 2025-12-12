/**
 * Update weather auto-exclusion reasons to include weather event type
 * 
 * This script:
 * 1. Updates the apply_weather_auto_exclusions() function to include weather type in reason
 * 2. Backfills existing weather exclusions with detailed reasons
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Updated auto-exclusion function that includes weather type in the reason
const sqlUpdatedAutoExclusionFunction = `
CREATE OR REPLACE FUNCTION apply_weather_auto_exclusions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows INTEGER := 0;
BEGIN
  -- 1) Find calls that match weather alerts, are not yet auto-excluded, AND are out of compliance
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
      AND cwm.is_out_of_compliance = TRUE
  ),

  -- 2) Insert audit rows
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
      -- NEW: Include weather type in the reason
      'Severe Weather Alert: ' || COALESCE(weather_event_type, 'Unknown') || 
        CASE WHEN weather_severity IS NOT NULL AND weather_severity != '' 
          THEN ' (' || weather_severity || ')' 
          ELSE '' 
        END AS exclusion_reason,
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
    RETURNING call_id, exclusion_reason
  )

  -- 3) Update calls table with detailed reason
  UPDATE calls c
  SET
    is_auto_excluded        = TRUE,
    auto_exclusion_strategy = 'NWS_WEATHER_ALERT',
    auto_exclusion_reason   = i.exclusion_reason,
    auto_excluded_at        = now(),
    auto_exclusion_metadata =
      COALESCE(c.auto_exclusion_metadata, '{}'::jsonb)
      || jsonb_build_object(
           'weather_exclusion', jsonb_build_object(
             'strategy', 'NWS_WEATHER_ALERT',
             'last_applied_at', now(),
             'reason', 'Weather auto-exclusion with event type details'
           )
         )
  FROM inserted i
  WHERE c.id = i.call_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;
`;

async function main() {
  const client = await pool.connect();
  
  try {
    console.log('=== Updating Weather Auto-Exclusion Function ===\n');
    
    // Step 1: Update the function
    console.log('1. Updating apply_weather_auto_exclusions() function...');
    await client.query(sqlUpdatedAutoExclusionFunction);
    console.log('   ✓ Function updated with weather type in reason\n');

    // Step 2: Backfill existing weather exclusions
    console.log('2. Backfilling existing weather exclusions with detailed reasons...');
    
    const backfillResult = await client.query(`
      UPDATE calls c
      SET auto_exclusion_reason =
        'Severe Weather Alert: ' || COALESCE(a.weather_event_type, 'Unknown') ||
        CASE WHEN a.weather_severity IS NOT NULL AND a.weather_severity != ''
          THEN ' (' || a.weather_severity || ')'
          ELSE ''
        END
      FROM call_weather_exclusion_audit a
      WHERE c.id = a.call_id
        AND c.auto_exclusion_strategy IN ('NWS_WEATHER_ALERT', 'WEATHER')
        AND c.auto_exclusion_reason IN (
          'Out-of-compliance call excluded due to NWS weather alert active during response',
          'Call occurred during active NWS weather alert inside alert polygon'
        )
      RETURNING c.id, c.response_number, c.auto_exclusion_reason
    `);
    
    console.log(`   ✓ Updated ${backfillResult.rowCount} existing weather exclusions\n`);
    
    if (backfillResult.rowCount > 0) {
      console.log('   Sample updated calls:');
      backfillResult.rows.slice(0, 5).forEach(row => {
        console.log(`     - Call ${row.response_number}: ${row.auto_exclusion_reason}`);
      });
      console.log('');
    }

    // Step 3: Verify the changes
    console.log('3. Verifying weather exclusions...');
    const verifyResult = await client.query(`
      SELECT 
        c.response_number,
        c.auto_exclusion_reason,
        a.weather_event_type,
        a.weather_severity
      FROM calls c
      JOIN call_weather_exclusion_audit a ON c.id = a.call_id
      WHERE c.auto_exclusion_strategy = 'NWS_WEATHER_ALERT'
      LIMIT 10
    `);
    
    console.log(`   Found ${verifyResult.rowCount} weather-excluded calls:`);
    verifyResult.rows.forEach(row => {
      console.log(`     - ${row.response_number}: ${row.auto_exclusion_reason}`);
      console.log(`       (Type: ${row.weather_event_type}, Severity: ${row.weather_severity || 'N/A'})`);
    });
    
    console.log('\n=== Update Complete ===');
    
  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

