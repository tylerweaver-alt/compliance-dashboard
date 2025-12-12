/**
 * Check if there's any temporal overlap between calls and LA weather events
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
    console.log('=== Checking Date Overlap ===\n');
    
    // 1. Call date range
    console.log('1. Call Date Range:');
    const callDates = await client.query(`
      SELECT 
        MIN(response_date_time::date) as earliest,
        MAX(response_date_time::date) as latest
      FROM calls
    `);
    console.log(`   Calls: ${callDates.rows[0].earliest} to ${callDates.rows[0].latest}`);
    console.log('');
    
    // 2. LA weather event date range
    console.log('2. Louisiana Weather Event Date Range:');
    const laDates = await client.query(`
      SELECT 
        MIN(starts_at::date) as earliest,
        MAX(ends_at::date) as latest,
        COUNT(*) as count
      FROM weather_events
      WHERE state = 'LA' AND source = 'NWS'
    `);
    console.log(`   LA Weather: ${laDates.rows[0].earliest} to ${laDates.rows[0].latest}`);
    console.log(`   Total LA events: ${laDates.rows[0].count}`);
    console.log('');
    
    // 3. LA weather events WITH geometry
    console.log('3. Louisiana Weather Events WITH Geometry:');
    const laWithGeom = await client.query(`
      SELECT 
        MIN(starts_at::date) as earliest,
        MAX(ends_at::date) as latest,
        COUNT(*) as count
      FROM weather_events
      WHERE state = 'LA' AND source = 'NWS' AND geojson IS NOT NULL
    `);
    console.log(`   LA Weather (with geom): ${laWithGeom.rows[0].earliest} to ${laWithGeom.rows[0].latest}`);
    console.log(`   Count: ${laWithGeom.rows[0].count}`);
    console.log('');
    
    // 4. Check for LA weather events during call period
    console.log('4. LA Weather Events During Call Period (Oct-Nov 2025):');
    const duringCalls = await client.query(`
      SELECT 
        event,
        severity,
        area_desc,
        starts_at::date as start_date,
        ends_at::date as end_date,
        geojson IS NOT NULL as has_geom
      FROM weather_events
      WHERE state = 'LA' 
        AND source = 'NWS'
        AND starts_at <= '2025-11-30'::date
        AND ends_at >= '2025-10-01'::date
      ORDER BY starts_at DESC
      LIMIT 20
    `);
    
    if (duringCalls.rowCount > 0) {
      console.log(`   Found ${duringCalls.rowCount} LA weather events during call period:`);
      duringCalls.rows.forEach(row => {
        console.log(`   - ${row.start_date} to ${row.end_date}: ${row.event} (${row.severity})`);
        console.log(`     ${row.area_desc?.substring(0, 70)}`);
        console.log(`     Has geometry: ${row.has_geom}`);
      });
    } else {
      console.log('   ❌ NO LA weather events overlap with call period (Oct 1 - Nov 30, 2025)');
    }
    console.log('');
    
    // 5. Check ALL states for weather during call period with geometry
    console.log('5. ANY Weather Events During Call Period WITH Geometry:');
    const anyDuringCalls = await client.query(`
      SELECT 
        state,
        event,
        severity,
        area_desc,
        starts_at::date as start_date,
        ends_at::date as end_date
      FROM weather_events
      WHERE source = 'NWS'
        AND geojson IS NOT NULL
        AND starts_at <= '2025-11-30'::date
        AND ends_at >= '2025-10-01'::date
      ORDER BY starts_at DESC
      LIMIT 20
    `);
    
    if (anyDuringCalls.rowCount > 0) {
      console.log(`   Found ${anyDuringCalls.rowCount} weather events (any state) during call period:`);
      anyDuringCalls.rows.forEach(row => {
        console.log(`   - ${row.state}: ${row.start_date} to ${row.end_date}: ${row.event} (${row.severity})`);
        console.log(`     ${row.area_desc?.substring(0, 70)}`);
      });
    } else {
      console.log('   ❌ NO weather events (any state) with geometry overlap with call period');
    }
    
    console.log('\n=== Analysis Complete ===');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

