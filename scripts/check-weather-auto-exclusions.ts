// Check if weather auto-exclusions are working correctly
import { Client } from 'pg';

async function checkWeatherAutoExclusions() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Check total weather exclusions
    const totalExclusions = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE exclusion_type = 'AUTO' AND exclusion_reason LIKE '%weather%') as auto_excluded,
        COUNT(*) FILTER (WHERE exclusion_type = 'MANUAL' AND exclusion_reason LIKE '%weather%') as manual_excluded,
        COUNT(*) as total_excluded
      FROM calls
      WHERE exclusion_type IS NOT NULL
        AND (exclusion_reason LIKE '%weather%' OR exclusion_reason LIKE '%Weather%')
    `);

    console.log('='.repeat(60));
    console.log('WEATHER EXCLUSIONS SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total excluded calls: ${totalExclusions.rows[0].total_excluded}`);
    console.log(`Auto-excluded by weather: ${totalExclusions.rows[0].auto_excluded}`);
    console.log(`Manually excluded (weather): ${totalExclusions.rows[0].manual_excluded}`);

    // Check recent weather exclusions with details
    const recentExclusions = await client.query(`
      SELECT
        c.id,
        c.response_date as call_date,
        c.call_in_que_time as call_time,
        c.origin_latitude as latitude,
        c.origin_longitude as longitude,
        c.exclusion_type,
        c.exclusion_reason,
        c.excluded_at
      FROM calls c
      WHERE c.exclusion_type = 'AUTO'
        AND (c.exclusion_reason LIKE '%weather%' OR c.exclusion_reason LIKE '%Weather%')
      ORDER BY c.response_date DESC, c.call_in_que_time DESC
      LIMIT 10
    `);

    if (recentExclusions.rows.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('RECENT WEATHER AUTO-EXCLUSIONS (Last 10):');
      console.log('='.repeat(60));
      
      recentExclusions.rows.forEach((call, idx) => {
        console.log(`\n${idx + 1}. Call ID: ${call.id}`);
        console.log(`   Date/Time: ${call.call_date} ${call.call_time}`);
        console.log(`   Location: ${call.latitude}, ${call.longitude}`);
        console.log(`   Excluded At: ${call.excluded_at}`);
        console.log(`   Reason: ${call.exclusion_reason}`);
      });
    } else {
      console.log('\n⚠️  NO WEATHER AUTO-EXCLUSIONS FOUND');
    }

    // Check weather events with geometry
    const weatherWithGeometry = await client.query(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(CASE WHEN geojson IS NOT NULL THEN 1 END) as with_geometry,
        COUNT(CASE WHEN starts_at >= '2025-10-01' AND ends_at <= '2025-11-30' THEN 1 END) as in_call_date_range
      FROM weather_events
      WHERE source = 'NWS'
    `);

    console.log('\n' + '='.repeat(60));
    console.log('WEATHER EVENTS DATA:');
    console.log('='.repeat(60));
    console.log(`Total NWS events: ${weatherWithGeometry.rows[0].total_events}`);
    console.log(`Events with geometry: ${weatherWithGeometry.rows[0].with_geometry}`);
    console.log(`Events in call date range (Oct-Nov 2025): ${weatherWithGeometry.rows[0].in_call_date_range}`);

    // Check call date range
    const callDateRange = await client.query(`
      SELECT
        MIN(response_date) as earliest_call,
        MAX(response_date) as latest_call,
        COUNT(*) as total_calls
      FROM calls
    `);

    console.log('\n' + '='.repeat(60));
    console.log('CALL DATA RANGE:');
    console.log('='.repeat(60));
    console.log(`Earliest call: ${callDateRange.rows[0].earliest_call}`);
    console.log(`Latest call: ${callDateRange.rows[0].latest_call}`);
    console.log(`Total calls: ${callDateRange.rows[0].total_calls}`);

    // Check for temporal overlap
    const overlap = await client.query(`
      SELECT
        COUNT(DISTINCT we.id) as overlapping_weather_events
      FROM weather_events we
      CROSS JOIN (
        SELECT MIN(response_date::date) as min_date, MAX(response_date::date) as max_date
        FROM calls
      ) c
      WHERE we.source = 'NWS'
        AND we.geojson IS NOT NULL
        AND we.starts_at::date <= c.max_date
        AND we.ends_at::date >= c.min_date
    `);

    console.log('\n' + '='.repeat(60));
    console.log('TEMPORAL OVERLAP ANALYSIS:');
    console.log('='.repeat(60));
    console.log(`Weather events with geometry that overlap call dates: ${overlap.rows[0].overlapping_weather_events}`);

    // Final diagnosis
    console.log('\n' + '='.repeat(60));
    console.log('DIAGNOSIS:');
    console.log('='.repeat(60));
    
    if (recentExclusions.rows.length === 0) {
      console.log('❌ No weather auto-exclusions found');
      
      if (parseInt(weatherWithGeometry.rows[0].with_geometry) === 0) {
        console.log('⚠️  Root cause: No weather events have geometry data');
      } else if (parseInt(overlap.rows[0].overlapping_weather_events) === 0) {
        console.log('⚠️  Root cause: No temporal overlap between weather events and calls');
      } else {
        console.log('⚠️  Weather events exist with geometry and overlap, but no exclusions');
        console.log('   → Check if auto-exclusion engine is running');
      }
    } else {
      console.log('✅ Weather auto-exclusions are working');
    }

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await client.end();
  }
}

checkWeatherAutoExclusions().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

