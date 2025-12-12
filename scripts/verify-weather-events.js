/**
 * Verify what's actually in the weather_events table
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
    console.log('=== Verifying Weather Events Table ===\n');
    
    // 1. Check if table exists
    console.log('1. Checking if weather_events table exists:');
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'weather_events'
      );
    `);
    console.log(`   Table exists: ${tableExists.rows[0].exists}`);
    console.log('');
    
    if (!tableExists.rows[0].exists) {
      console.log('❌ weather_events table does not exist!');
      return;
    }
    
    // 2. Total count
    console.log('2. Total count in weather_events:');
    const totalCount = await client.query(`
      SELECT COUNT(*) as count FROM weather_events
    `);
    console.log(`   Total records: ${totalCount.rows[0].count}`);
    console.log('');
    
    // 3. Count by source
    console.log('3. Count by source:');
    const bySource = await client.query(`
      SELECT source, COUNT(*) as count
      FROM weather_events
      GROUP BY source
      ORDER BY count DESC
    `);
    bySource.rows.forEach(row => {
      console.log(`   ${row.source || 'NULL'}: ${row.count}`);
    });
    console.log('');
    
    // 4. Sample records
    console.log('4. Sample records (first 5):');
    const samples = await client.query(`
      SELECT 
        id,
        nws_id,
        source,
        state,
        event,
        severity,
        starts_at::date as start_date,
        ends_at::date as end_date
      FROM weather_events
      ORDER BY id
      LIMIT 5
    `);
    
    if (samples.rowCount > 0) {
      samples.rows.forEach(row => {
        console.log(`   ID ${row.id}: ${row.event} (${row.severity})`);
        console.log(`     Source: ${row.source}, State: ${row.state}`);
        console.log(`     Dates: ${row.start_date} to ${row.end_date}`);
        console.log(`     NWS ID: ${row.nws_id?.substring(0, 50)}...`);
        console.log('');
      });
    } else {
      console.log('   No records found');
    }
    
    // 5. Check table schema
    console.log('5. Table schema:');
    const schema = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'weather_events'
      ORDER BY ordinal_position
    `);
    console.log('   Columns:');
    schema.rows.forEach(row => {
      console.log(`     - ${row.column_name}: ${row.data_type}`);
    });
    console.log('');
    
    // 6. Database connection info
    console.log('6. Database connection:');
    const dbInfo = await client.query(`SELECT current_database(), current_schema()`);
    console.log(`   Database: ${dbInfo.rows[0].current_database}`);
    console.log(`   Schema: ${dbInfo.rows[0].current_schema}`);
    console.log(`   Connection string: ${process.env.DATABASE_URL?.substring(0, 50)}...`);
    
    console.log('\n=== Verification Complete ===');
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

