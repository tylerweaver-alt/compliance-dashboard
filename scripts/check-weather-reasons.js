const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  
  try {
    console.log('=== Current Weather Exclusion Reasons ===\n');
    
    const result = await client.query(`
      SELECT 
        c.id,
        c.response_number,
        c.auto_exclusion_reason,
        c.auto_exclusion_strategy,
        a.weather_event_type,
        a.weather_severity
      FROM calls c
      LEFT JOIN call_weather_exclusion_audit a ON c.id = a.call_id
      WHERE c.auto_exclusion_strategy IN ('NWS_WEATHER_ALERT', 'WEATHER')
      ORDER BY c.id
      LIMIT 20
    `);
    
    console.log(`Found ${result.rowCount} weather-excluded calls:\n`);
    
    result.rows.forEach(row => {
      console.log(`Call ${row.response_number}:`);
      console.log(`  Reason: ${row.auto_exclusion_reason}`);
      console.log(`  Type: ${row.weather_event_type || 'N/A'}`);
      console.log(`  Severity: ${row.weather_severity || 'N/A'}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

main();

