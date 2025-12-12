/**
 * Debug why weather matching isn't finding overlaps
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  
  try {
    console.log('=== Debugging Weather Matching ===\n');
    
    // 1. Check if calls have geometry
    console.log('1. Checking call geometry:');
    const callGeom = await client.query(`
      SELECT
        COUNT(*) as total_calls,
        COUNT(geom) as calls_with_geom,
        COUNT(origin_latitude) as calls_with_lat,
        COUNT(origin_longitude) as calls_with_lon
      FROM calls
    `);
    console.log(`   Total calls: ${callGeom.rows[0].total_calls}`);
    console.log(`   Calls with geom: ${callGeom.rows[0].calls_with_geom}`);
    console.log(`   Calls with origin_latitude: ${callGeom.rows[0].calls_with_lat}`);
    console.log(`   Calls with origin_longitude: ${callGeom.rows[0].calls_with_lon}`);
    console.log('');
    
    // 2. Check if weather_events have geometry
    console.log('2. Checking weather event geometry:');
    const weatherGeom = await client.query(`
      SELECT 
        COUNT(*) as total_events,
        COUNT(geojson) as events_with_geojson,
        source,
        COUNT(*) as count
      FROM weather_events
      GROUP BY source
    `);
    weatherGeom.rows.forEach(row => {
      console.log(`   ${row.source}: ${row.count} events`);
    });
    
    const withGeom = await client.query(`
      SELECT COUNT(*) as count
      FROM weather_events
      WHERE geojson IS NOT NULL AND source = 'NWS'
    `);
    console.log(`   NWS events with geojson: ${withGeom.rows[0].count}`);
    console.log('');
    
    // 3. Check Louisiana-specific weather events
    console.log('3. Louisiana weather events:');
    const laWeather = await client.query(`
      SELECT 
        event,
        severity,
        area_desc,
        starts_at::date as date,
        geojson IS NOT NULL as has_geom
      FROM weather_events
      WHERE state = 'LA' AND source = 'NWS'
      ORDER BY starts_at DESC
      LIMIT 10
    `);
    if (laWeather.rowCount > 0) {
      console.log(`   Found ${laWeather.rowCount} LA weather events (showing first 10):`);
      laWeather.rows.forEach(row => {
        console.log(`   - ${row.date}: ${row.event} (${row.severity}) - Geom: ${row.has_geom}`);
        console.log(`     ${row.area_desc?.substring(0, 70)}`);
      });
    } else {
      console.log('   No Louisiana weather events found');
    }
    console.log('');
    
    // 4. Check if calls are in Louisiana
    console.log('4. Calls by state/parish:');
    const callsByParish = await client.query(`
      SELECT 
        p.name as parish_name,
        COUNT(c.id) as call_count
      FROM calls c
      LEFT JOIN parishes p ON c.parish_id = p.id
      GROUP BY p.name
      ORDER BY call_count DESC
      LIMIT 10
    `);
    callsByParish.rows.forEach(row => {
      console.log(`   ${row.parish_name || 'Unknown'}: ${row.call_count} calls`);
    });
    console.log('');
    
    // 5. Sample call coordinates
    console.log('5. Sample call coordinates:');
    const sampleCalls = await client.query(`
      SELECT
        response_number,
        origin_latitude,
        origin_longitude,
        geom IS NOT NULL as has_geom
      FROM calls
      WHERE origin_latitude IS NOT NULL AND origin_longitude IS NOT NULL
      LIMIT 5
    `);
    sampleCalls.rows.forEach(row => {
      console.log(`   ${row.response_number}: (${row.origin_latitude}, ${row.origin_longitude}) - Geom: ${row.has_geom}`);
    });
    console.log('');
    
    // 6. Check calls_with_times view
    console.log('6. Checking calls_with_times view:');
    const callsWithTimes = await client.query(`
      SELECT COUNT(*) as count
      FROM calls_with_times
      WHERE geom IS NOT NULL
    `);
    console.log(`   Calls with geometry in calls_with_times: ${callsWithTimes.rows[0].count}`);
    console.log('');
    
    // 7. Try a manual spatial query
    console.log('7. Testing manual spatial overlap (LA only):');
    const manualTest = await client.query(`
      SELECT
        c.response_number,
        c.origin_latitude,
        c.origin_longitude,
        w.event,
        w.area_desc
      FROM calls c
      CROSS JOIN weather_events w
      WHERE c.geom IS NOT NULL
        AND w.geojson IS NOT NULL
        AND w.state = 'LA'
        AND w.source = 'NWS'
        AND ST_Intersects(
          c.geom::geometry,
          ST_GeomFromGeoJSON(w.geojson::text)
        )
      LIMIT 5
    `);
    
    if (manualTest.rowCount > 0) {
      console.log(`   Found ${manualTest.rowCount} spatial overlaps!`);
      manualTest.rows.forEach(row => {
        console.log(`   - ${row.response_number} overlaps with ${row.event}`);
      });
    } else {
      console.log('   No spatial overlaps found');
    }
    
    console.log('\n=== Debug Complete ===');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

