const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    const res = await pool.query("SELECT pg_get_viewdef('calls_with_times'::regclass, true)");
    console.log('calls_with_times view definition:');
    console.log(res.rows[0].pg_get_viewdef);
  } catch (err) {
    console.error(err.message);
  } finally {
    await pool.end();
  }
}

run();

