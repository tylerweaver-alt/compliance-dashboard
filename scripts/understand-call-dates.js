/**
 * Understand the actual dates in the call data
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
    console.log('=== Understanding Call Dates ===\n');
    
    // 1. Sample call dates
    console.log('1. Sample Call Dates (first 10):');
    const samples = await client.query(`
      SELECT 
        response_number,
        response_date,
        response_date_time,
        uploaded_at
      FROM calls
      ORDER BY id
      LIMIT 10
    `);
    
    samples.rows.forEach(row => {
      console.log(`   ${row.response_number}:`);
      console.log(`     response_date: ${row.response_date}`);
      console.log(`     response_date_time: ${row.response_date_time}`);
      console.log(`     uploaded_at: ${row.uploaded_at}`);
      console.log('');
    });
    
    // 2. Check if these are real dates or test dates
    console.log('2. Date Analysis:');
    const now = new Date();
    console.log(`   Current date: ${now.toISOString()}`);
    console.log('');
    
    const futureCheck = await client.query(`
      SELECT 
        COUNT(*) as total_calls,
        COUNT(CASE WHEN response_date_time::timestamptz > NOW() THEN 1 END) as future_calls,
        COUNT(CASE WHEN response_date_time::timestamptz <= NOW() THEN 1 END) as past_calls
      FROM calls
    `);
    
    console.log(`   Total calls: ${futureCheck.rows[0].total_calls}`);
    console.log(`   Future calls (dates > today): ${futureCheck.rows[0].future_calls}`);
    console.log(`   Past calls (dates <= today): ${futureCheck.rows[0].past_calls}`);
    console.log('');
    
    // 3. Interpretation
    if (parseInt(futureCheck.rows[0].future_calls) > 0) {
      console.log('⚠️  INTERPRETATION:');
      console.log('   Your call data contains FUTURE dates (Oct-Nov 2025).');
      console.log('   These are likely:');
      console.log('   - Test/demo data with placeholder dates');
      console.log('   - OR dates that should be Oct-Nov 2024 (typo in year)');
      console.log('');
      console.log('   The NWS API cannot provide weather alerts for future dates.');
      console.log('   Historical weather data is only available for past dates.');
      console.log('');
      console.log('   OPTIONS:');
      console.log('   1. If these should be 2024 dates, we can update the year in the database');
      console.log('   2. If this is test data, we can create synthetic weather alerts for testing');
      console.log('   3. Upload real call data from 2024 with actual historical dates');
    } else {
      console.log('✅ All calls have past dates - we can fetch real historical weather data');
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

