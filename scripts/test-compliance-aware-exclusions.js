/**
 * Test script for compliance-aware weather auto-exclusions
 * 
 * Creates 3 synthetic test cases:
 * - Call A: Overlaps weather alert + IN COMPLIANCE (green) => Should NOT be excluded
 * - Call B: Overlaps weather alert + OUT OF COMPLIANCE (red) => SHOULD be excluded
 * - Call C: Outside weather alert time/location => Should NOT be excluded
 */
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    console.log('=== Testing Compliance-Aware Weather Auto-Exclusions ===\n');

    // First, clear any previous test data
    console.log('Clearing previous test data...');
    await client.query(`DELETE FROM calls WHERE response_number LIKE 'TEST-COMPLIANCE-%'`);
    await client.query(`DELETE FROM weather_events WHERE event LIKE 'TEST-%'`);
    await client.query(`DELETE FROM call_weather_exclusion_audit WHERE exclusion_reason LIKE '%TEST%'`);

    // Get a sample parish_id and response_area with a known threshold
    const zoneInfo = await client.query(`
      SELECT parish_id, response_area, threshold_minutes 
      FROM response_area_mappings 
      WHERE threshold_minutes IS NOT NULL
      LIMIT 1
    `);
    
    if (zoneInfo.rows.length === 0) {
      console.error('No zone thresholds found. Cannot run test.');
      return;
    }

    const { parish_id, response_area, threshold_minutes } = zoneInfo.rows[0];
    console.log(`Using zone: ${response_area} with ${threshold_minutes} min threshold (parish ${parish_id})\n`);

    // Create a test weather alert polygon covering Louisiana
    const testPolygon = {
      type: "Polygon",
      coordinates: [[
        [-93.0, 30.0], [-92.0, 30.0], [-92.0, 31.5], [-93.0, 31.5], [-93.0, 30.0]
      ]]
    };
    
    const alertStart = new Date('2025-01-15T10:00:00Z');
    const alertEnd = new Date('2025-01-15T18:00:00Z');

    // Insert test weather alert
    console.log('Creating test weather alert...');
    await client.query(`
      INSERT INTO weather_events (nws_id, source, event, severity, area_desc, starts_at, ends_at, geojson)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, ['TEST-COMPLIANCE-ALERT-001', 'TEST', 'TEST-Severe Thunderstorm Warning', 'Severe', 'Test Area for Compliance Testing', alertStart, alertEnd, JSON.stringify(testPolygon)]);

    // Base time for calls (during alert window)
    const callQueTime = new Date('2025-01-15T12:00:00Z');
    
    // Calculate response times
    // Call A: COMPLIANT (threshold is X minutes, we'll respond in X-1 minutes)
    const compliantArrivalTime = new Date(callQueTime.getTime() + (threshold_minutes - 1) * 60 * 1000);
    
    // Call B: NON-COMPLIANT (threshold is X minutes, we'll respond in X+5 minutes)
    const nonCompliantArrivalTime = new Date(callQueTime.getTime() + (parseFloat(threshold_minutes) + 5) * 60 * 1000);
    
    // Call C: Outside alert window
    const outsideAlertQueTime = new Date('2025-01-16T12:00:00Z'); // Next day
    const outsideAlertArrivalTime = new Date(outsideAlertQueTime.getTime() + (parseFloat(threshold_minutes) + 5) * 60 * 1000);

    // Coordinates inside the test polygon
    const testLat = 30.5;
    const testLon = -92.5;

    // Create the 3 test calls
    // Note: geom is a generated column based on origin_latitude/origin_longitude, so we don't insert it directly
    console.log('Creating test calls...');

    // Call A: IN COMPLIANCE + overlaps weather
    await client.query(`
      INSERT INTO calls (parish_id, response_number, response_area, origin_latitude, origin_longitude,
                        call_in_que_time, arrived_at_scene_time, response_date_time,
                        is_excluded, is_auto_excluded)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, FALSE)
    `, [parish_id, 'TEST-COMPLIANCE-A-GREEN', response_area, testLat, testLon,
        callQueTime.toISOString(), compliantArrivalTime.toISOString(), callQueTime.toISOString()]);

    // Call B: OUT OF COMPLIANCE + overlaps weather
    await client.query(`
      INSERT INTO calls (parish_id, response_number, response_area, origin_latitude, origin_longitude,
                        call_in_que_time, arrived_at_scene_time, response_date_time,
                        is_excluded, is_auto_excluded)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, FALSE)
    `, [parish_id, 'TEST-COMPLIANCE-B-RED', response_area, testLat, testLon,
        callQueTime.toISOString(), nonCompliantArrivalTime.toISOString(), callQueTime.toISOString()]);

    // Call C: Outside alert window
    await client.query(`
      INSERT INTO calls (parish_id, response_number, response_area, origin_latitude, origin_longitude,
                        call_in_que_time, arrived_at_scene_time, response_date_time,
                        is_excluded, is_auto_excluded)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE, FALSE)
    `, [parish_id, 'TEST-COMPLIANCE-C-OUTSIDE', response_area, testLat, testLon,
        outsideAlertQueTime.toISOString(), outsideAlertArrivalTime.toISOString(), outsideAlertQueTime.toISOString()]);

    console.log('\n--- Test calls created ---');
    console.log(`Call A (GREEN): Response time ~${threshold_minutes - 1} min (under ${threshold_minutes} min threshold)`);
    console.log(`Call B (RED): Response time ~${parseFloat(threshold_minutes) + 5} min (over ${threshold_minutes} min threshold)`);
    console.log(`Call C: Outside alert window (next day)\n`);

    // Check calls_with_compliance for our test calls
    console.log('--- Verifying compliance status ---');
    const complianceCheck = await client.query(`
      SELECT 
        response_number,
        ROUND(response_time_minutes::numeric, 2) as resp_min,
        applicable_threshold_minutes as thresh_min,
        is_out_of_compliance,
        CASE 
          WHEN is_out_of_compliance = TRUE THEN 'RED'
          WHEN is_out_of_compliance = FALSE THEN 'GREEN'
          ELSE 'UNKNOWN'
        END as status
      FROM calls_with_compliance
      WHERE response_number LIKE 'TEST-COMPLIANCE-%'
      ORDER BY response_number
    `);
    complianceCheck.rows.forEach(r => {
      console.log(`  ${r.response_number}: ${r.resp_min} min vs ${r.thresh_min} min => ${r.status}`);
    });

    // Check call_weather_matches
    console.log('\n--- Checking weather matches ---');
    const weatherMatches = await client.query(`
      SELECT 
        response_number,
        is_out_of_compliance,
        weather_event_type,
        CASE 
          WHEN is_out_of_compliance = TRUE THEN 'WILL BE EXCLUDED'
          ELSE 'WILL NOT BE EXCLUDED'
        END as decision
      FROM call_weather_matches
      WHERE response_number LIKE 'TEST-COMPLIANCE-%'
      ORDER BY response_number
    `);
    console.log(`Found ${weatherMatches.rows.length} weather matches:`);
    weatherMatches.rows.forEach(r => {
      console.log(`  ${r.response_number}: ${r.decision}`);
    });

    // Run the auto-exclusion function
    console.log('\n--- Running apply_weather_auto_exclusions() ---');
    const result = await client.query('SELECT apply_weather_auto_exclusions() as rows_updated');
    console.log(`Rows auto-excluded: ${result.rows[0].rows_updated}`);

    // Verify results
    console.log('\n--- FINAL RESULTS ---');
    const finalCheck = await client.query(`
      SELECT 
        response_number,
        is_auto_excluded,
        auto_exclusion_strategy,
        CASE 
          WHEN is_auto_excluded = TRUE THEN '❌ EXCLUDED'
          ELSE '✅ NOT EXCLUDED'
        END as result
      FROM calls
      WHERE response_number LIKE 'TEST-COMPLIANCE-%'
      ORDER BY response_number
    `);
    
    console.log('\nExpected results:');
    console.log('  Call A (GREEN, overlaps weather) => Should NOT be excluded');
    console.log('  Call B (RED, overlaps weather) => SHOULD be excluded');
    console.log('  Call C (outside alert) => Should NOT be excluded');
    console.log('\nActual results:');
    finalCheck.rows.forEach(r => {
      console.log(`  ${r.response_number}: ${r.result} ${r.auto_exclusion_strategy || ''}`);
    });

    // Verify expectations
    const callA = finalCheck.rows.find(r => r.response_number === 'TEST-COMPLIANCE-A-GREEN');
    const callB = finalCheck.rows.find(r => r.response_number === 'TEST-COMPLIANCE-B-RED');
    const callC = finalCheck.rows.find(r => r.response_number === 'TEST-COMPLIANCE-C-OUTSIDE');

    console.log('\n=== TEST RESULTS ===');
    const passA = callA && callA.is_auto_excluded === false;
    const passB = callB && callB.is_auto_excluded === true && callB.auto_exclusion_strategy === 'NWS_WEATHER_ALERT';
    const passC = callC && callC.is_auto_excluded === false;

    console.log(`Call A (green call, overlaps weather): ${passA ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Call B (red call, overlaps weather): ${passB ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`Call C (outside alert window): ${passC ? '✅ PASS' : '❌ FAIL'}`);

    if (passA && passB && passC) {
      console.log('\n🎉 ALL TESTS PASSED! Compliance-aware weather exclusions are working correctly.');
    } else {
      console.log('\n⚠️ Some tests failed. Check the logic.');
    }

    // Cleanup
    console.log('\nCleaning up test data...');
    await client.query(`DELETE FROM calls WHERE response_number LIKE 'TEST-COMPLIANCE-%'`);
    await client.query(`DELETE FROM weather_events WHERE event LIKE 'TEST-%'`);
    console.log('Done.');

  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

run();

