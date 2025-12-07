const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    // Check calls_with_times time columns
    const res = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name='calls_with_times' AND column_name LIKE '%time%'
      ORDER BY ordinal_position
    `);
    console.log('Time columns in calls_with_times:');
    res.rows.forEach(c => console.log('  ' + c.column_name));

    // Check calls columns
    const res2 = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name='calls' AND (column_name LIKE '%time%' OR column_name LIKE '%start%' OR column_name LIKE '%end%')
      ORDER BY ordinal_position
    `);
    console.log('\nTime/start/end columns in calls:');
    res2.rows.forEach(c => console.log('  ' + c.column_name));

    // Check if calls_with_times has call_start_time, call_end_time
    const res3 = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name='calls_with_times' AND column_name IN ('call_start_time', 'call_end_time')
    `);
    console.log('\ncall_start_time/call_end_time in calls_with_times:');
    res3.rows.forEach(c => console.log('  ' + c.column_name));

  } catch (err) {
    console.error(err.message);
  } finally {
    await pool.end();
  }
}

run();

