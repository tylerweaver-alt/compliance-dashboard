// Legacy script: moved here because it appears unused; kept for reference.
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    // Show parishes table schema
    const cols = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'parishes'
      ORDER BY ordinal_position
    `);
    console.log('parishes columns:');
    cols.rows.forEach(c => console.log('  ' + c.column_name + ': ' + c.data_type));

    // Show sample parishes data
    const parishes = await pool.query('SELECT id, name, region, is_contracted FROM parishes ORDER BY region, name LIMIT 20');
    console.log('\nSample parishes:');
    parishes.rows.forEach(p => console.log('  ', p));

    // Show contracted parishes for Central Louisiana
    const contracted = await pool.query(`
      SELECT p.id, p.name, p.region, p.is_contracted
      FROM parishes p
      JOIN regions r ON p.region = r.name
      WHERE r.id = 1 AND p.is_contracted = true
      ORDER BY p.name
    `);
    console.log('\nContracted parishes in region 1:');
    contracted.rows.forEach(p => console.log('  ', p));

  } catch (e) {
    console.error(e);
  } finally {
    pool.end();
  }
}

run();
