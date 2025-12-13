// Install and test text-based weather auto-exclusion function
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function installTextBasedWeatherExclusions() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Read the SQL file
    const sqlPath = path.join(__dirname, 'setup-text-based-weather-exclusions.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('='.repeat(80));
    console.log('INSTALLING TEXT-BASED WEATHER AUTO-EXCLUSION FUNCTION');
    console.log('='.repeat(80));
    console.log('This secondary function matches calls to weather alerts when polygon');
    console.log('data is not available, using text-based area matching instead.\n');

    // Execute the SQL
    await client.query(sql);
    console.log('✅ Function installed successfully!\n');

    // Test: Check how many alerts have no geojson
    console.log('='.repeat(80));
    console.log('CHECKING WEATHER ALERTS WITHOUT POLYGON DATA');
    console.log('='.repeat(80));

    const noGeojsonResult = await client.query(`
      SELECT 
        state,
        COUNT(*) as alert_count,
        COUNT(DISTINCT event) as unique_events,
        MIN(starts_at) as earliest,
        MAX(starts_at) as latest
      FROM weather_events
      WHERE source = 'NWS'
        AND geojson IS NULL
        AND starts_at >= '2025-12-10'
      GROUP BY state
      ORDER BY alert_count DESC
    `);

    console.log(`\nAlerts without polygon data (since Dec 10):`);
    noGeojsonResult.rows.forEach(row => {
      console.log(`  ${row.state}: ${row.alert_count} alerts (${row.unique_events} types)`);
    });

    const totalNoGeojson = noGeojsonResult.rows.reduce((sum, row) => sum + parseInt(row.alert_count), 0);
    console.log(`\nTotal: ${totalNoGeojson} alerts without polygon data`);

    // Test: Check potential text-based matches
    console.log('\n' + '='.repeat(80));
    console.log('ANALYZING POTENTIAL TEXT-BASED MATCHES');
    console.log('='.repeat(80));

    const potentialMatches = await client.query(`
      SELECT 
        COUNT(DISTINCT c.id) as potential_call_matches,
        COUNT(DISTINCT w.id) as matching_alerts,
        w.state,
        w.event
      FROM calls c
      CROSS JOIN weather_events w
      WHERE 
        w.geojson IS NULL
        AND w.source = 'NWS'
        AND w.area_desc IS NOT NULL
        AND w.starts_at >= '2025-12-10'
        AND c.response_date_time::timestamptz >= w.starts_at
        AND c.response_date_time::timestamptz <= COALESCE(w.ends_at, w.starts_at + INTERVAL '24 hours')
        AND (
          (c.origin_location_city IS NOT NULL AND EXISTS (
            SELECT 1 FROM unnest(string_to_array(w.area_desc, ';')) AS area_name
            WHERE TRIM(LOWER(area_name)) LIKE '%' || LOWER(TRIM(c.origin_location_city)) || '%'
               OR LOWER(TRIM(c.origin_location_city)) LIKE '%' || TRIM(LOWER(area_name)) || '%'
          ))
          OR (c.response_area IS NOT NULL AND EXISTS (
            SELECT 1 FROM unnest(string_to_array(w.area_desc, ';')) AS area_name
            WHERE TRIM(LOWER(area_name)) LIKE '%' || LOWER(TRIM(c.response_area)) || '%'
          ))
        )
      GROUP BY w.state, w.event
      ORDER BY potential_call_matches DESC
      LIMIT 10
    `);

    if (potentialMatches.rows.length > 0) {
      console.log('\nPotential matches found:');
      potentialMatches.rows.forEach(row => {
        console.log(`  ${row.state} - ${row.event}: ${row.potential_call_matches} calls, ${row.matching_alerts} alerts`);
      });
    } else {
      console.log('\n⚠️  No potential text-based matches found');
      console.log('   This could mean:');
      console.log('   - Call dates don\'t overlap with recent alerts');
      console.log('   - City/area names don\'t match between calls and alerts');
      console.log('   - Calls are already excluded');
    }

    // Run the function
    console.log('\n' + '='.repeat(80));
    console.log('RUNNING TEXT-BASED EXCLUSION FUNCTION');
    console.log('='.repeat(80));

    const result = await client.query('SELECT apply_weather_text_based_exclusions() as excluded_count');
    const excludedCount = result.rows[0].excluded_count;

    console.log(`\n✅ Function executed successfully!`);
    console.log(`   Excluded ${excludedCount} calls based on text-based weather matching\n`);

    if (excludedCount > 0) {
      // Show some examples
      const examples = await client.query(`
        SELECT 
          c.id,
          c.response_number,
          c.response_date,
          c.origin_location_city,
          c.exclusion_reason,
          a.weather_event_type,
          a.weather_area_desc
        FROM calls c
        JOIN call_weather_exclusion_audit a ON a.call_id = c.id
        WHERE a.exclusion_strategy = 'NWS_WEATHER_TEXT_MATCH'
        ORDER BY c.response_date DESC
        LIMIT 5
      `);

      console.log('='.repeat(80));
      console.log('EXAMPLE EXCLUSIONS:');
      console.log('='.repeat(80));
      examples.rows.forEach((ex, idx) => {
        console.log(`\n${idx + 1}. Call ${ex.response_number} (${ex.response_date})`);
        console.log(`   Location: ${ex.origin_location_city}`);
        console.log(`   Weather: ${ex.weather_event_type}`);
        console.log(`   Alert Areas: ${ex.weather_area_desc?.substring(0, 60)}...`);
        console.log(`   Reason: ${ex.exclusion_reason}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('INSTALLATION COMPLETE');
    console.log('='.repeat(80));
    console.log('The text-based weather exclusion function is now installed and active.');
    console.log('It will automatically run alongside polygon-based matching.');
    console.log('\nTo manually run it again: SELECT apply_weather_text_based_exclusions();');

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await client.end();
  }
}

installTextBasedWeatherExclusions().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

