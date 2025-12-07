import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_kmi8sw9UfbZT@ep-small-violet-a4kbnj8l-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require'
});

try {
  // Fix bad timestamps - replace :99 seconds with :59
  console.log('Fixing bad timestamps...');

  const fix1 = await pool.query(`
    UPDATE calls
    SET arrived_at_scene_time = REGEXP_REPLACE(arrived_at_scene_time, ':99$', ':59')
    WHERE arrived_at_scene_time ~ ':99$'
  `);
  console.log('Fixed arrived_at_scene_time:', fix1.rowCount, 'rows');

  const fix2 = await pool.query(`
    UPDATE calls
    SET call_in_que_time = REGEXP_REPLACE(call_in_que_time, ':99$', ':59')
    WHERE call_in_que_time ~ ':99$'
  `);
  console.log('Fixed call_in_que_time:', fix2.rowCount, 'rows');

  // Verify fix
  const verify = await pool.query(`
    SELECT id, arrived_at_scene_time, call_in_que_time
    FROM calls
    WHERE (arrived_at_scene_time ~ ':99$') OR (call_in_que_time ~ ':99$')
  `);
  console.log('Remaining bad timestamps:', verify.rows.length);

} catch(e) {
  console.error('Error:', e.message);
} finally {
  await pool.end();
}

