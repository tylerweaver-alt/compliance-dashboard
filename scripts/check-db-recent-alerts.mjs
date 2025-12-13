// Check database for alerts since Dec 10, 2025
import { query } from '../lib/db.ts';

async function checkDatabaseAlerts() {
  try {
    console.log('Checking database for recent alerts...\n');

    // Check alerts since Dec 10, 2025
    const result = await query(`
      SELECT 
        state,
        COUNT(*) as total_alerts,
        COUNT(CASE WHEN starts_at >= '2025-12-10T00:00:00Z' THEN 1 END) as alerts_since_dec_10,
        COUNT(CASE WHEN starts_at >= '2025-12-10T00:00:00Z' AND geojson IS NOT NULL THEN 1 END) as recent_with_geometry
      FROM weather_events
      WHERE source = 'NWS'
      GROUP BY state
      ORDER BY state
    `);

    console.log('='.repeat(60));
    console.log('DATABASE: Alerts by State');
    console.log('='.repeat(60));
    
    let totalAll = 0;
    let totalRecent = 0;
    let totalRecentWithGeom = 0;
    
    result.rows.forEach(row => {
      console.log(`\nState: ${row.state || 'NULL'}`);
      console.log(`  Total alerts: ${row.total_alerts}`);
      console.log(`  Alerts since Dec 10: ${row.alerts_since_dec_10}`);
      console.log(`  Recent with geometry: ${row.recent_with_geometry}`);
      
      totalAll += parseInt(row.total_alerts);
      totalRecent += parseInt(row.alerts_since_dec_10);
      totalRecentWithGeom += parseInt(row.recent_with_geometry);
    });

    console.log('\n' + '='.repeat(60));
    console.log('DATABASE SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total NWS alerts: ${totalAll}`);
    console.log(`Alerts since Dec 10: ${totalRecent}`);
    console.log(`Recent with geometry: ${totalRecentWithGeom}`);

    // Show some recent alerts
    const recentAlerts = await query(`
      SELECT 
        nws_id,
        state,
        event,
        severity,
        starts_at,
        ends_at,
        area_desc,
        geojson IS NOT NULL as has_geometry
      FROM weather_events
      WHERE source = 'NWS'
        AND starts_at >= '2025-12-10T00:00:00Z'
      ORDER BY starts_at DESC
      LIMIT 10
    `);

    if (recentAlerts.rows.length > 0) {
      console.log('\n' + '='.repeat(60));
      console.log('Recent Alerts in Database (first 10):');
      console.log('='.repeat(60));
      
      recentAlerts.rows.forEach((alert, idx) => {
        console.log(`\n${idx + 1}. ${alert.event} (${alert.severity || 'N/A'})`);
        console.log(`   State: ${alert.state || 'N/A'}`);
        console.log(`   Starts: ${alert.starts_at}`);
        console.log(`   Ends: ${alert.ends_at}`);
        console.log(`   Area: ${alert.area_desc?.substring(0, 60) || 'N/A'}...`);
        console.log(`   Has geometry: ${alert.has_geometry ? 'YES' : 'NO'}`);
      });
    } else {
      console.log('\nNo alerts found since Dec 10, 2025');
    }

    // Check when data was last updated
    const lastUpdate = await query(`
      SELECT 
        MAX(updated_at) as last_update,
        MAX(starts_at) as latest_alert_start
      FROM weather_events
      WHERE source = 'NWS'
    `);

    console.log('\n' + '='.repeat(60));
    console.log('Last Update Info:');
    console.log('='.repeat(60));
    console.log(`Last database update: ${lastUpdate.rows[0].last_update}`);
    console.log(`Latest alert start time: ${lastUpdate.rows[0].latest_alert_start}`);

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

checkDatabaseAlerts().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

