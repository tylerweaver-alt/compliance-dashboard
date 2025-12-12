const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const p = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    // Get columns from calls_with_times view
    const res = await p.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name='calls_with_times'
      ORDER BY ordinal_position
      LIMIT 50
    `);
    console.log('calls_with_times columns:');
    res.rows.forEach(c => console.log('  ' + c.column_name + ': ' + c.data_type));

    // Check response_area_mappings structure
    const res3 = await p.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name='response_area_mappings'
      ORDER BY ordinal_position
    `);
    console.log('\nresponse_area_mappings columns:');
    res3.rows.forEach(c => console.log('  ' + c.column_name + ': ' + c.data_type));

    // Check parish_settings structure
    const res4 = await p.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name='parish_settings'
      ORDER BY ordinal_position
    `);
    console.log('\nparish_settings columns:');
    res4.rows.forEach(c => console.log('  ' + c.column_name + ': ' + c.data_type));

    // Sample of zone thresholds
    const res5 = await p.query(`
      SELECT response_area, threshold_minutes, parish_id
      FROM response_area_mappings
      WHERE threshold_minutes IS NOT NULL
      LIMIT 10
    `);
    console.log('\nSample zone thresholds:');
    res5.rows.forEach(r => console.log('  ' + r.response_area + ': ' + r.threshold_minutes + ' min (parish ' + r.parish_id + ')'));

    // Sample parish settings
    const res6 = await p.query(`
      SELECT parish_id, global_response_threshold_seconds
      FROM parish_settings
      LIMIT 10
    `);
    console.log('\nSample parish settings:');
    res6.rows.forEach(r => console.log('  Parish ' + r.parish_id + ': ' + (r.global_response_threshold_seconds/60) + ' min'));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await p.end();
  }
})();

