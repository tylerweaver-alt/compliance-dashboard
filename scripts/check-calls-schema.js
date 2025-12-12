/**
 * Check the actual schema of the calls table
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
    console.log('=== Calls Table Schema ===\n');
    
    // Get all columns
    const columns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'calls'
      ORDER BY ordinal_position
    `);
    
    console.log('Columns in calls table:');
    columns.rows.forEach(row => {
      console.log(`  ${row.column_name}: ${row.data_type}`);
    });
    
    console.log('\n=== Sample Call Data ===\n');
    
    // Get a sample call
    const sample = await client.query(`
      SELECT *
      FROM calls
      LIMIT 1
    `);
    
    if (sample.rowCount > 0) {
      const call = sample.rows[0];
      console.log('Sample call fields:');
      Object.keys(call).forEach(key => {
        const value = call[key];
        if (value !== null && value !== undefined) {
          const display = typeof value === 'string' && value.length > 50 
            ? value.substring(0, 50) + '...' 
            : value;
          console.log(`  ${key}: ${display}`);
        }
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

