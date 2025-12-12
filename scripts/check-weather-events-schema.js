const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    // Step 1: Find a sample call to target
    console.log('=== Step 1: Finding a sample call ===');
    const sampleCall = await pool.query(`
      SELECT
        id,
        parish_id,
        call_start_time,
        call_end_time,
        ST_AsText(geom) AS wkt
      FROM calls_with_times
      WHERE geom IS NOT NULL
        AND safe_timestamptz(call_start_time) IS NOT NULL
        AND safe_timestamptz(call_end_time) IS NOT NULL
        AND COALESCE(is_auto_excluded, FALSE) = FALSE
      LIMIT 1
    `);

    if (sampleCall.rows.length === 0) {
      console.log('No suitable call found!');
      return;
    }

    const call = sampleCall.rows[0];
    console.log(`Found call: ${call.id}`);
    console.log(`  Start: ${call.call_start_time}`);
    console.log(`  End: ${call.call_end_time}`);
    console.log(`  Location: ${call.wkt}`);

    // Step 2: Insert synthetic test alert
    console.log('\n=== Step 2: Inserting synthetic test alert ===');
    const testNwsId = `TEST-${Date.now()}`;
    await pool.query(`
      INSERT INTO weather_events (
        nws_id,
        source,
        state,
        event,
        severity,
        area_desc,
        starts_at,
        ends_at,
        geojson,
        created_at,
        updated_at
      )
      SELECT
        $1,
        'TEST',
        'LA',
        'TEST Weather Alert',
        'Severe',
        'Synthetic test alert around call ' || c.id,
        safe_timestamptz(c.call_start_time) - interval '10 minutes',
        safe_timestamptz(c.call_end_time) + interval '10 minutes',
        ST_AsGeoJSON(ST_Buffer(c.geom::geography, 10000)::geometry)::jsonb,
        now(),
        now()
      FROM calls_with_times c
      WHERE c.id = $2
    `, [testNwsId, call.id]);
    console.log(`Inserted test alert with nws_id: ${testNwsId}`);

    // Step 3: Check call_weather_matches
    console.log('\n=== Step 3: Checking call_weather_matches ===');
    const matches = await pool.query(`
      SELECT *
      FROM call_weather_matches
      WHERE weather_event_type = 'TEST Weather Alert'
    `);
    console.log(`Found ${matches.rows.length} matches for TEST Weather Alert`);
    if (matches.rows.length > 0) {
      const m = matches.rows[0];
      console.log(`  Call ID: ${m.call_id}`);
      console.log(`  Weather Event: ${m.weather_event_type} (${m.weather_severity})`);
      console.log(`  Overlap: ${m.overlap_start} to ${m.overlap_end}`);
    }

    // Step 4: Run auto-exclusion
    console.log('\n=== Step 4: Running apply_weather_auto_exclusions() ===');
    const exclusionResult = await pool.query(`SELECT apply_weather_auto_exclusions()`);
    console.log(`Rows excluded: ${exclusionResult.rows[0].apply_weather_auto_exclusions}`);

    // Step 5: Verify exclusion
    console.log('\n=== Step 5: Verifying exclusion ===');
    const excluded = await pool.query(`
      SELECT
        id,
        is_excluded,
        exclusion_reason,
        is_auto_excluded,
        auto_exclusion_strategy,
        auto_exclusion_reason
      FROM calls
      WHERE id = $1
    `, [call.id]);

    if (excluded.rows.length > 0) {
      const e = excluded.rows[0];
      console.log(`Call ${e.id}:`);
      console.log(`  is_auto_excluded: ${e.is_auto_excluded}`);
      console.log(`  auto_exclusion_strategy: ${e.auto_exclusion_strategy}`);
      console.log(`  auto_exclusion_reason: ${e.auto_exclusion_reason}`);
    }

    // Check audit trail
    console.log('\n=== Step 6: Checking audit trail ===');
    const audit = await pool.query(`
      SELECT * FROM call_weather_exclusion_audit
      WHERE call_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [call.id]);

    if (audit.rows.length > 0) {
      console.log('Audit record found:');
      console.log(`  Weather Event: ${audit.rows[0].weather_event_type}`);
      console.log(`  Severity: ${audit.rows[0].weather_severity}`);
    } else {
      console.log('No audit record found');
    }

    console.log('\n✅ Test complete!');

    // Show recent LA/TX/TN/MS alerts
    console.log('\n=== Recent LA/TX/TN/MS NWS Alerts ===');
    const recentAlerts = await pool.query(`
      SELECT state, event, severity, area_desc, starts_at::date as date
      FROM weather_events
      WHERE state IN ('LA','TX','TN','MS')
        AND source = 'NWS'
      ORDER BY starts_at DESC
      LIMIT 15
    `);
    recentAlerts.rows.forEach(a =>
      console.log(`  ${a.state}: ${a.event} (${a.severity}) - ${a.area_desc?.substring(0, 50)}...`)
    );

    // Check total call_weather_matches
    console.log('\n=== Call-Weather Matches ===');
    const finalMatches = await pool.query(`SELECT COUNT(*) FROM call_weather_matches`);
    console.log(`Total matches: ${finalMatches.rows[0].count}`);

    // Debug: Check calls from Nov 27-30 and their parishes
    console.log('\n=== Calls from Nov 27-30 (when we have LA alerts) ===');
    const novCalls = await pool.query(`
      SELECT c.id, c.parish_id,
             safe_timestamptz(c.call_start_time) as start_time,
             ST_AsText(c.geom) as location
      FROM calls_with_times c
      WHERE safe_timestamptz(c.call_start_time) >= '2025-11-27'
        AND safe_timestamptz(c.call_start_time) <= '2025-12-01'
      LIMIT 10
    `);
    console.log(`Found ${novCalls.rows.length} calls:`);
    novCalls.rows.forEach(c =>
      console.log(`  Call ${c.id}: parish ${c.parish_id} - ${c.location?.substring(0, 40)}`)
    );

    // Check which parishes have Flood Warnings
    console.log('\n=== Parishes in Flood Warnings ===');
    const floodAreas = await pool.query(`
      SELECT DISTINCT area_desc
      FROM weather_events
      WHERE state = 'LA' AND event LIKE '%Flood%'
      LIMIT 5
    `);
    floodAreas.rows.forEach(a => console.log(`  ${a.area_desc?.substring(0, 80)}`));

    // Count alerts from last 7 days
    const count7d = await pool.query(`
      SELECT COUNT(*) FROM weather_events WHERE starts_at >= NOW() - INTERVAL '7 days'
    `);
  } catch (err) {
    console.error(err.message);
  } finally {
    await pool.end();
  }
}

run();
