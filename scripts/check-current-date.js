/**
 * Check current date and latest weather alerts
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
    console.log('=== Date Analysis ===\n');
    
    // 1. Current date/time
    console.log('1. Current Date/Time:');
    const now = new Date();
    console.log(`   System time (local): ${now.toString()}`);
    console.log(`   System time (UTC): ${now.toISOString()}`);
    console.log(`   System time (date only): ${now.toISOString().split('T')[0]}`);
    console.log('');
    
    // 2. Database current time
    console.log('2. Database Current Time:');
    const dbNow = await client.query(`SELECT NOW() as db_time, CURRENT_DATE as db_date`);
    console.log(`   Database time: ${dbNow.rows[0].db_time}`);
    console.log(`   Database date: ${dbNow.rows[0].db_date}`);
    console.log('');
    
    // 3. Latest weather alert dates
    console.log('3. Weather Alert Date Range:');
    const alertDates = await client.query(`
      SELECT 
        MIN(starts_at)::date as earliest_start,
        MAX(starts_at)::date as latest_start,
        MAX(ends_at)::date as latest_end,
        COUNT(*) as total_alerts
      FROM weather_events
      WHERE source = 'NWS'
    `);
    
    const alert = alertDates.rows[0];
    console.log(`   Total NWS alerts: ${alert.total_alerts}`);
    console.log(`   Earliest alert start: ${alert.earliest_start}`);
    console.log(`   Latest alert start: ${alert.latest_start}`);
    console.log(`   Latest alert end: ${alert.latest_end}`);
    console.log('');
    
    // 4. Most recent alerts
    console.log('4. Most Recent NWS Alerts (by start date):');
    const recent = await client.query(`
      SELECT 
        event,
        severity,
        area_desc,
        starts_at,
        ends_at
      FROM weather_events
      WHERE source = 'NWS'
      ORDER BY starts_at DESC
      LIMIT 5
    `);
    
    recent.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.event} (${row.severity})`);
      console.log(`      Starts: ${row.starts_at}`);
      console.log(`      Ends: ${row.ends_at}`);
      console.log(`      Area: ${row.area_desc?.substring(0, 60)}`);
      console.log('');
    });
    
    // 5. Check if we're in the future
    console.log('5. Time Analysis:');
    const futureCheck = await client.query(`
      SELECT 
        COUNT(*) as future_alerts
      FROM weather_events
      WHERE source = 'NWS' AND starts_at > NOW()
    `);
    
    console.log(`   Alerts with future start dates: ${futureCheck.rows[0].future_alerts}`);
    
    if (parseInt(futureCheck.rows[0].future_alerts) > 0) {
      console.log('   ⚠️  WARNING: Weather alerts have future dates!');
      console.log('   This suggests either:');
      console.log('   - The system clock is incorrect');
      console.log('   - OR the weather data is actually current/future forecasts');
    } else {
      console.log('   ✅ All weather alerts are in the past (historical data)');
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

