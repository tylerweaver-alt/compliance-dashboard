// Legacy script: moved here because it appears unused; kept for reference.
require('dotenv').config({ path: '.env.local' });
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    // Check columns
    const cols = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'regions' 
      ORDER BY ordinal_position
    `);
    console.log('Columns:');
    console.log(JSON.stringify(cols.rows, null, 2));

    // Check constraints
    const constraints = await pool.query(`
      SELECT tc.constraint_name, tc.constraint_type, kcu.column_name 
      FROM information_schema.table_constraints tc 
      JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name 
      WHERE tc.table_name = 'regions'
    `);
    console.log('\nConstraints:');
    console.log(JSON.stringify(constraints.rows, null, 2));
  } catch (e) {
    console.error(e.message);
  } finally {
    pool.end();
  }
}

main();
