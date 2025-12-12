/**
 * Analyze weather_events table to see what data we have
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
    console.log('=== Weather Events Analysis ===\n');
    
    // 1. Total count by source
    console.log('1. Weather Events by Source:');
    const bySource = await client.query(`
      SELECT source, COUNT(*) as count
      FROM weather_events
      GROUP BY source
      ORDER BY count DESC
    `);
    bySource.rows.forEach(row => {
      console.log(`   ${row.source}: ${row.count} events`);
    });
    console.log('');
    
    // 2. Date range of data
    console.log('2. Date Range of Weather Events:');
    const dateRange = await client.query(`
      SELECT 
        MIN(starts_at)::date as earliest,
        MAX(ends_at)::date as latest
      FROM weather_events
    `);
    if (dateRange.rows[0].earliest) {
      console.log(`   Earliest: ${dateRange.rows[0].earliest}`);
      console.log(`   Latest: ${dateRange.rows[0].latest}`);
    } else {
      console.log('   No weather events found');
    }
    console.log('');
    
    // 3. Real NWS alerts (not TEST)
    console.log('3. Real NWS Alerts (source = NWS):');
    const nwsAlerts = await client.query(`
      SELECT 
        event,
        severity,
        area_desc,
        starts_at::date as date,
        state
      FROM weather_events
      WHERE source = 'NWS'
      ORDER BY starts_at DESC
      LIMIT 10
    `);
    if (nwsAlerts.rowCount > 0) {
      console.log(`   Found ${nwsAlerts.rowCount} NWS alerts (showing first 10):`);
      nwsAlerts.rows.forEach(row => {
        console.log(`   - ${row.date}: ${row.event} (${row.severity}) - ${row.area_desc?.substring(0, 60)}`);
      });
    } else {
      console.log('   No real NWS alerts found in database');
    }
    console.log('');
    
    // 4. Date range of calls
    console.log('4. Date Range of Calls:');
    const callRange = await client.query(`
      SELECT 
        MIN(response_date_time)::date as earliest,
        MAX(response_date_time)::date as latest,
        COUNT(*) as total_calls
      FROM calls
    `);
    if (callRange.rows[0].earliest) {
      console.log(`   Earliest call: ${callRange.rows[0].earliest}`);
      console.log(`   Latest call: ${callRange.rows[0].latest}`);
      console.log(`   Total calls: ${callRange.rows[0].total_calls}`);
    }
    console.log('');
    
    // 5. Check for overlaps between NWS alerts and calls
    console.log('5. Potential Overlaps (NWS alerts during call date range):');
    const overlaps = await client.query(`
      SELECT 
        w.event,
        w.severity,
        w.area_desc,
        w.starts_at::date as alert_date,
        COUNT(DISTINCT c.id) as potential_call_matches
      FROM weather_events w
      LEFT JOIN calls c ON 
        c.response_date_time::timestamptz >= w.starts_at 
        AND c.response_date_time::timestamptz <= w.ends_at
      WHERE w.source = 'NWS'
      GROUP BY w.id, w.event, w.severity, w.area_desc, w.starts_at
      HAVING COUNT(DISTINCT c.id) > 0
      ORDER BY potential_call_matches DESC
      LIMIT 10
    `);
    
    if (overlaps.rowCount > 0) {
      console.log(`   Found ${overlaps.rowCount} NWS alerts with potential call overlaps:`);
      overlaps.rows.forEach(row => {
        console.log(`   - ${row.alert_date}: ${row.event} (${row.severity})`);
        console.log(`     Area: ${row.area_desc?.substring(0, 70)}`);
        console.log(`     Potential matches: ${row.potential_call_matches} calls`);
      });
    } else {
      console.log('   No NWS alerts overlap with call date range');
    }
    console.log('');
    
    // 6. Check call_weather_matches view
    console.log('6. Call-Weather Matches (from view):');
    const matches = await client.query(`
      SELECT 
        weather_event_type,
        weather_severity,
        COUNT(*) as match_count
      FROM call_weather_matches
      GROUP BY weather_event_type, weather_severity
      ORDER BY match_count DESC
    `);
    
    if (matches.rowCount > 0) {
      console.log(`   Found ${matches.rowCount} types of weather matches:`);
      matches.rows.forEach(row => {
        console.log(`   - ${row.weather_event_type} (${row.weather_severity}): ${row.match_count} matches`);
      });
    } else {
      console.log('   No matches found in call_weather_matches view');
    }
    
    console.log('\n=== Analysis Complete ===');
    
  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

